/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { DEFAULT_MAX_STEPS } from '@chamberu/core';
import type { Agent, OverlapPolicy } from '@chamberu/core';
import { BadRequestError, NotFoundError } from '@ebec/http';
import { defineSchema } from '@rapiq/core';
import { CronExpressionParser } from 'cron-parser';
import { isObject } from 'smob';
import { Container } from 'validup';
import { DEFAULT_PAGE_LIMIT } from '../app/constants.ts';
import { webhookUrl } from '../hooks/helpers.ts';
import { decodeQuery } from '../request/helpers.ts';
import { isDefined } from '../request/validators.ts';
import type { AgentSummary, KvBody, ScheduleSummary } from './types.ts';

/**
 * Any top-level filter key, no sort; values are coerced by rapiq (`2` ->
 * `2`, `true`, `null`), and `filterValue` makes a double-quoted value a string.
 */
const COLLECTION_QUERY_SCHEMA = defineSchema({ sorts: { allowed: [] }, throwOnFailure: true });

export function summarizeAgent(agent: Agent, basePath: string): AgentSummary {
    const { definition } = agent;
    const summary: AgentSummary = {
        name: agent.name,
        triggers: (definition.triggers ?? []).map((trigger) => (trigger.source === 'webhook' ?
            {
                source: trigger.source,
                id: trigger.id,
                hook: webhookUrl(basePath, agent.name, String(trigger.options.path)),
            } :
            { source: trigger.source, id: trigger.id })),
        // defineAgent applied the defaults; the type keeps them optional
        budget: { maxSteps: DEFAULT_MAX_STEPS, ...definition.budget },
        approvals: Object.keys(definition.approvals ?? {}),
        state: Object.keys(definition.state ?? {}),
    };
    if (definition.notify !== undefined) summary.notify = definition.notify;
    return summary;
}

/** Every `cron()` trigger of every agent, in definition order, with its next fire time after `now`. */
export function listSchedules(agents: Iterable<Agent>, now: Date): ScheduleSummary[] {
    const schedules: ScheduleSummary[] = [];
    for (const agent of agents) {
        for (const trigger of agent.definition.triggers ?? []) {
            if (trigger.source !== 'cron') continue;
            const expression = String(trigger.options.expression);
            const timezone = trigger.options.timezone as string | undefined;
            const nextAt = CronExpressionParser.parse(expression, {
                currentDate: now,
                ...(timezone ? { tz: timezone } : {}),
            }).next().toDate().toISOString();
            schedules.push({
                agent: agent.name,
                trigger: trigger.id,
                expression,
                ...(timezone ? { timezone } : {}),
                overlap: (trigger.options.overlap as OverlapPolicy | undefined) ?? 'skip',
                nextAt,
            });
        }
    }
    return schedules;
}

/** The agent by name, else 404. */
export function requireAgent(agents: Map<string, Agent>, name: string): Agent {
    const agent = agents.get(name);
    if (!agent) throw new NotFoundError({ message: `Agent "${name}" was not found.` });
    return agent;
}

/** 404 when the agent declares state collections and this is none of them. */
export function assertCollection(agent: Agent, collection: string): void {
    const declared = agent.definition.state;
    if (declared && !Object.hasOwn(declared, collection)) {
        throw new NotFoundError({ message: `Agent "${agent.name}" declares no state collection "${collection}".` });
    }
}

export function createKvContainer(): Container<KvBody> {
    const container = new Container<KvBody>();
    container.mount('value', isDefined());
    return container;
}

/**
 * A collection filter value: rapiq coerces `42`, `007`, `true` and `null`
 * (quoted or not), so one pair of double quotes marks a string that keeps
 * its text (`"42"` -> `'42'`); everything else is rapiq's value.
 */
function filterValue(value: unknown): unknown {
    if (typeof value === 'string' && value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
        return value.slice(1, -1);
    }
    return value;
}

/** A collection list query: top-level `eq` filters as `where`, a limit, no offset, no sort. */
export function parseCollectionQuery(searchParams: URLSearchParams): { where: Record<string, unknown>; limit: number } {
    const decoded = decodeQuery(searchParams, COLLECTION_QUERY_SCHEMA);
    const where: Record<string, unknown> = {};
    for (const filter of decoded.filters) {
        if (filter.operator !== 'eq') {
            throw new BadRequestError({ message: 'Only top-level equality filters are supported.' });
        }
        if (filter.field === 'id') {
            // `id` on the wire is the store id, which `where` cannot match
            throw new BadRequestError({ message: 'filter[id] is not supported: id is the store id, not a document field.' });
        }
        if (Object.hasOwn(where, filter.field)) {
            throw new BadRequestError({ message: `filter[${filter.field}] may be given once.` });
        }
        where[filter.field] = filterValue(filter.value);
    }
    if (decoded.offset !== undefined && decoded.offset > 0) {
        throw new BadRequestError({ message: 'page[offset] is not supported for state collections.' });
    }
    return { where, limit: decoded.limit ?? DEFAULT_PAGE_LIMIT };
}

/** A stored document on the wire: its fields plus the store `id` (which wins over a field named `id`). */
export function serializeDoc(entry: { id: string; doc: unknown }): Record<string, unknown> {
    return isObject(entry.doc) ? { ...entry.doc, id: entry.id } : { id: entry.id, doc: entry.doc };
}
