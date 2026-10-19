/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidResumeTokenError, RunNotFoundError, RunStatus } from '@chamberu/core';
import type {
    Agent,
    Run,
    RunStatusLiteral,
    TriggerDefinition,
} from '@chamberu/core';
import { BadRequestError, ForbiddenError, NotFoundError } from '@ebec/http';
import { defineSchema } from '@rapiq/core';
import type { IFilter } from '@rapiq/core';
import { parseFilterScalar } from '@rapiq/parser-simple';
import { isObject } from 'smob';
import { Container } from 'validup';
import { agentPermission, hasPermission } from '../auth/module.ts';
import { Permission } from '../auth/constants.ts';
import type { Principal } from '../auth/types.ts';
import { DEFAULT_PAGE_LIMIT } from '../app/constants.ts';
import type { HttpContext } from '../app/types.ts';
import { decodeQuery } from '../request/helpers.ts';
import { isBoolean, isDefined, isString } from '../request/validators.ts';
import { KEY_MAX_LENGTH } from '../request/constants.ts';
import { RESUME_REASON_MAX_LENGTH, RESUME_TOKEN_MAX_LENGTH } from './constants.ts';
import type {
    ResumeBody,
    RunListQuery,
    RunView,
    StartRunBody,
} from './types.ts';

/** Drops the internal `claim` (owner and lease expiry) from a run. */
export function serializeRun(run: Run): RunView {
    const view: RunView & { claim?: unknown } = { ...run };
    delete view.claim;
    return view;
}

/** `run:read`, or `agent:<run.agent>:run`. */
export function canReadRun(principal: Principal, run: Run): boolean {
    return hasPermission(principal, Permission.RUN_READ) ||
        hasPermission(principal, agentPermission(run.agent, 'run'));
}

/** The run, once the principal may read it: 404, then 403. */
export async function loadReadableRun(ctx: HttpContext, principal: Principal, id: string): Promise<Run> {
    const run = await ctx.store.getRun(id);
    if (!run) throw new RunNotFoundError(id);
    if (!canReadRun(principal, run)) {
        throw new ForbiddenError({ message: `Missing permission "${Permission.RUN_READ}".` });
    }
    return run;
}

/**
 * 403 unless the principal may list runs: `run:read`, or a filter to one
 * agent it may run (one store query keeps `total` and paging exact).
 */
export function assertCanListRuns(principal: Principal, agent: string | undefined): void {
    if (hasPermission(principal, Permission.RUN_READ)) return;
    if (agent !== undefined && hasPermission(principal, agentPermission(agent, 'run'))) return;
    throw new ForbiddenError({ message: `Missing permission "${Permission.RUN_READ}".` });
}

/** The agent's `http()` trigger, else 404. */
export function requireHttpTrigger(agent: Agent): TriggerDefinition {
    const trigger = agent.definition.triggers?.find((t) => t.source === 'http');
    if (!trigger) throw new NotFoundError({ message: `Agent "${agent.name}" declares no http() trigger.` });
    return trigger;
}

export function createStartRunContainer(): Container<StartRunBody> {
    const container = new Container<StartRunBody>();
    container.mount('payload', { optional: true }, isDefined());
    container.mount('idempotencyKey', { optional: true }, isString({ min: 1, max: KEY_MAX_LENGTH }));
    container.mount('thread', { optional: true }, isString({ min: 1, max: KEY_MAX_LENGTH }));
    return container;
}

const RUN_LIST_SCHEMA = defineSchema({
    filters: { allowed: ['agent', 'status'] },
    sorts: { allowed: ['createdAt'] },
    throwOnFailure: true,
});

const RUN_STATUSES = new Set<string>(Object.values(RunStatus));

/**
 * The wire is untyped: rapiq coerces `123`, `007`, `true` or `null` to a
 * scalar, even quoted. Such a value maps back to the registered agent
 * whose name coerces to it; an unregistered one reads in canonical form.
 */
function readAgentFilter(filter: IFilter, agentNames: Iterable<string>): string {
    const { value } = filter;
    if (filter.operator !== 'eq' || Array.isArray(value) || isObject(value)) {
        throw new BadRequestError({ message: 'filter[agent] takes one agent name.' });
    }
    if (typeof value === 'string') return value;

    const matches = [...agentNames].filter((name) => parseFilterScalar(name) === value);
    if (matches.length > 1) {
        throw new BadRequestError({ message: 'filter[agent] matches more than one agent; the query string cannot tell them apart.' });
    }
    return matches[0] ?? String(value);
}

function readStatusFilter(filter: IFilter): RunStatusLiteral[] {
    let values: unknown[] | undefined;
    if (filter.operator === 'eq') values = [filter.value];
    else if (filter.operator === 'in' && Array.isArray(filter.value)) values = filter.value;
    if (!values || values.some((value) => !(typeof value === 'string' && RUN_STATUSES.has(value)))) {
        throw new BadRequestError({ message: 'filter[status] takes run statuses.' });
    }
    return values as RunStatusLiteral[];
}

/**
 * `GET /runs` query: one agent, statuses, a page, `sort=createdAt` only.
 * `agentNames` (the app's agents) resolve an agent name the wire coerced.
 */
export function parseRunListQuery(searchParams: URLSearchParams, agentNames: Iterable<string> = []): RunListQuery {
    const decoded = decodeQuery(searchParams, RUN_LIST_SCHEMA);

    const seen = new Set<string>();
    const query: RunListQuery = {
        limit: decoded.limit ?? DEFAULT_PAGE_LIMIT,
        offset: decoded.offset ?? 0,
    };
    for (const filter of decoded.filters) {
        if (seen.has(filter.field)) {
            throw new BadRequestError({ message: `filter[${filter.field}] may be given once.` });
        }
        seen.add(filter.field);
        if (filter.field === 'agent') query.agent = readAgentFilter(filter, agentNames);
        else query.status = readStatusFilter(filter);
    }

    const [sort, ...others] = decoded.sorts;
    if (others.length > 0 || (sort && (sort.name !== 'createdAt' || sort.operator !== 'ASC'))) {
        throw new BadRequestError({ message: 'Only sort=createdAt is supported.' });
    }

    return query;
}

export function createResumeContainer(): Container<ResumeBody> {
    const container = new Container<ResumeBody>();
    container.mount('token', isString({ min: 1, max: RESUME_TOKEN_MAX_LENGTH }));
    container.mount('approved', isBoolean());
    container.mount('reason', { optional: true }, isString({ max: RESUME_REASON_MAX_LENGTH }));
    return container;
}

/**
 * The run a resume token answers, once the principal may approve for its
 * agent: the signature and expiry are checked before any store lookup
 * (400), a run that does not exist reads as an invalid token (400), a
 * missing `agent:<agent>:approve` is 403.
 */
export async function resolveResumeTarget(ctx: HttpContext, principal: Principal, token: string): Promise<Run> {
    const claims = ctx.engine.inspectResumeToken(token);
    const run = await ctx.store.getRun(claims.runId);
    if (!run) throw new InvalidResumeTokenError();

    const permission = agentPermission(run.agent, 'approve');
    if (!hasPermission(principal, permission)) {
        throw new ForbiddenError({ message: `Missing permission "${permission}".` });
    }
    return run;
}
