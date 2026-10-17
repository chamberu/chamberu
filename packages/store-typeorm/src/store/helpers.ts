/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    Checkpoint,
    Run,
    RunStatusLiteral,
    Step,
    TriggerEnvelope,
    WaitPoint,
} from '@chamberu/core';
import type { CheckpointRow, RunRow, StepRow } from './types.ts';

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
const JSONB_RUN_COLUMNS: ReadonlySet<string> = new Set([
    'trigger',
    'output',
    'error',
    'usage',
    'waiting',
]);

/**
 * A \u escape that Postgres jsonb rejects: NUL, or a surrogate. JSON.stringify
 * writes surrogate pairs as raw characters, so an escaped surrogate is always
 * a lone one. The leading group keeps an escaped backslash (`\\u0000` is the
 * text "\u0000", not a NUL) out of the match.
 */
const UNSUPPORTED_JSONB_ESCAPE = /(?<!\\)((?:\\\\)*)\\u(?:0000|d[89a-f][0-9a-f]{2})/g;

/**
 * JSON parameter for a jsonb column: SQL NULL for undefined, JSON otherwise
 * (null -> 'null'). NUL characters and lone surrogates, which jsonb cannot
 * hold, become U+FFFD.
 */
export function json(value: unknown): string | null {
    if (value === undefined) {
        return null;
    }

    return JSON.stringify(value).replace(UNSUPPORTED_JSONB_ESCAPE, '$1\\ufffd');
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

        if (!Object.hasOwn(RUN_COLUMNS, key)) {
            continue;
        }

        const column = RUN_COLUMNS[key]!;
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

/** Map a chamberu_steps row to a Step: null name/input/output/error become absent. */
export function toStep(row: StepRow): Step {
    const step: Step = {
        runId: row.run_id,
        index: row.step_index,
        kind: row.kind as Step['kind'],
        startedAt: row.started_at,
        finishedAt: row.finished_at,
    };
    if (row.name !== null) step.name = row.name;
    if (row.input !== null) step.input = row.input;
    if (row.output !== null) step.output = row.output;
    if (row.error !== null) step.error = row.error;

    return step;
}

/** Map a chamberu_checkpoints row to a Checkpoint: a null finish reason becomes absent. */
export function toCheckpoint(row: CheckpointRow): Checkpoint {
    const checkpoint: Checkpoint = {
        runId: row.run_id,
        stepIndex: row.step_index,
        messages: row.messages as Checkpoint['messages'],
        createdAt: row.created_at,
    };
    if (row.finish_reason !== null) checkpoint.finishReason = row.finish_reason;

    return checkpoint;
}
