/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidResumeTokenError, RunStatus } from '@chamberu/core';
import type {
    Agent,
    Run,
    RunStatusLiteral,
    TriggerDefinition,
} from '@chamberu/core';
import { BadRequestError, ForbiddenError, NotFoundError } from '@ebec/http';
import { defineSchema } from '@rapiq/core';
import type { IFilter } from '@rapiq/core';
import { Container } from 'validup';
import { agentPermission, hasPermission } from '../auth/module.ts';
import { Permission } from '../auth/constants.ts';
import type { Principal } from '../auth/types.ts';
import { DEFAULT_PAGE_LIMIT } from '../app/constants.ts';
import type { HttpContext } from '../app/types.ts';
import { decodeQuery } from '../request/helpers.ts';
import { isBoolean, isDefined, isString } from '../request/validators.ts';
import { KEY_MAX_LENGTH, RESUME_REASON_MAX_LENGTH, RESUME_TOKEN_MAX_LENGTH } from './constants.ts';
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

/** The agent by name, else 404. */
export function requireAgent(ctx: HttpContext, name: string): Agent {
    const agent = ctx.agents.get(name);
    if (!agent) throw new NotFoundError({ message: `Agent "${name}" was not found.` });
    return agent;
}

/** The agent's `http()` trigger, else 404. */
export function requireHttpTrigger(agent: Agent): TriggerDefinition {
    const trigger = agent.definition.triggers?.find((t) => t.source === 'http');
    if (!trigger) throw new NotFoundError({ message: `Agent "${agent.name}" declares no http() trigger.` });
    return trigger;
}

/** An `Idempotency-Key` header: 1 to 256 characters, else 400. */
export function readIdempotencyHeader(request: Request): string | undefined {
    const value = request.headers.get('idempotency-key');
    if (value === null) return undefined;
    if (value.length < 1 || value.length > KEY_MAX_LENGTH) {
        throw new BadRequestError({ message: `The Idempotency-Key header must have 1 to ${KEY_MAX_LENGTH} characters.` });
    }
    return value;
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

function readAgentFilter(filter: IFilter): string {
    if (filter.operator !== 'eq' || typeof filter.value !== 'string') {
        throw new BadRequestError({ message: 'filter[agent] takes one agent name.' });
    }
    return filter.value;
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

/** `GET /runs` (and MCP `list_runs`) query: one agent, statuses, a page, `sort=createdAt` only. */
export function parseRunListQuery(searchParams: URLSearchParams): RunListQuery {
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
        if (filter.field === 'agent') query.agent = readAgentFilter(filter);
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
