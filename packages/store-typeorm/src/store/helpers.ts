/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    Run,
    RunStatusLiteral,
    TriggerEnvelope,
    WaitPoint,
} from '@chamberu/core';
import type { RunRow } from './types.ts';

/** Run properties stored in a column of their own, by column name. */
const RUN_COLUMNS: Record<string, string> = {
    agent: 'agent',
    status: 'status',
    trigger: 'trigger',
    concurrencyKey: 'concurrency_key',
    thread: 'thread',
    output: 'output',
    error: 'error',
    usage: 'usage',
    waiting: 'waiting',
    cancelRequested: 'cancel_requested',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    startedAt: 'started_at',
    finishedAt: 'finished_at',
};

/** Columns whose parameter is serialized JSON and needs a ::jsonb cast. */
export const JSONB_RUN_COLUMNS: ReadonlySet<string> = new Set([
    'trigger',
    'output',
    'error',
    'usage',
    'waiting',
]);

/** JSON parameter for a jsonb column: SQL NULL for undefined, JSON otherwise (null -> 'null'). */
export function json(value: unknown): string | null {
    if (value === undefined) {
        return null;
    }

    return JSON.stringify(value);
}

/**
 * Column values for the keys present in a run patch (id excluded). A key set
 * to undefined clears its column, an absent key is not touched.
 */
export function toRunColumns(patch: Partial<Run>): Record<string, unknown> {
    const columns: Record<string, unknown> = {};

    for (const key of Object.keys(patch)) {
        if (key === 'id') {
            continue;
        }

        const value = patch[key as keyof Run];
        if (key === 'claim') {
            const claim = value as Run['claim'];
            columns.claim_owner = claim ? claim.owner : null;
            columns.claim_expires_at = claim ? claim.expiresAt : null;
            continue;
        }

        const column = RUN_COLUMNS[key];
        if (!column) {
            continue;
        }

        if (JSONB_RUN_COLUMNS.has(column)) {
            columns[column] = json(value);
        } else {
            columns[column] = value ?? null;
        }
    }

    return columns;
}

/** SQL placeholder for a run column: jsonb columns get a cast. */
export function runPlaceholder(column: string, index: number): string {
    return JSONB_RUN_COLUMNS.has(column) ? `$${index}::jsonb` : `$${index}`;
}

function reviveTrigger(trigger: Record<string, unknown>): TriggerEnvelope {
    return {
        ...trigger,
        receivedAt: new Date(trigger.receivedAt as string),
    } as TriggerEnvelope;
}

function reviveWaiting(waiting: Record<string, unknown>): WaitPoint {
    const output = {
        ...waiting,
        expiresAt: new Date(waiting.expiresAt as string),
    } as WaitPoint;
    if (typeof waiting.notifiedAt === 'string') {
        output.notifiedAt = new Date(waiting.notifiedAt);
    }

    return output;
}

/** Map a chamberu_runs row to a Run: SQL NULL columns become absent properties. */
export function toRun(row: RunRow): Run {
    const run: Run = {
        id: row.id,
        agent: row.agent,
        status: row.status as RunStatusLiteral,
        trigger: reviveTrigger(row.trigger),
        usage: row.usage,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };

    if (row.concurrency_key !== null) run.concurrencyKey = row.concurrency_key;
    if (row.thread !== null) run.thread = row.thread;
    if (row.output !== null) run.output = row.output;
    if (row.error !== null) run.error = row.error;
    if (row.waiting !== null) run.waiting = reviveWaiting(row.waiting);
    if (row.claim_owner !== null) {
        run.claim = { owner: row.claim_owner, expiresAt: row.claim_expires_at as Date };
    }
    if (row.cancel_requested !== null) run.cancelRequested = row.cancel_requested;
    if (row.started_at !== null) run.startedAt = row.started_at;
    if (row.finished_at !== null) run.finishedAt = row.finished_at;

    return run;
}
