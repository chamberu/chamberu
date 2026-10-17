/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock } from '@chamberu/core';
import type { DataSource } from 'typeorm';

export type TypeormStoreOptions = {
    /** An initialized Postgres data source listing STORE_ENTITIES and STORE_MIGRATIONS. */
    dataSource: DataSource;
    /** Source of time for leases and expiry (default: systemClock). */
    clock?: IClock;
};

export type PurgeResult = {
    idempotencyKeys: number;
    locks: number;
};

/** A chamberu_runs row as pg returns it (timestamptz as Date, jsonb parsed). */
export type RunRow = {
    id: string;
    agent: string;
    status: string;
    trigger: Record<string, unknown>;
    concurrency_key: string | null;
    thread: string | null;
    output: unknown;
    error: { code: string; message: string } | null;
    usage: { inputTokens: number; outputTokens: number };
    waiting: Record<string, unknown> | null;
    claim_owner: string | null;
    claim_expires_at: Date | null;
    cancel_requested: boolean | null;
    created_at: Date;
    updated_at: Date;
    started_at: Date | null;
    finished_at: Date | null;
};

export type StepRow = {
    seq: string;
    run_id: string;
    step_index: number;
    kind: string;
    name: string | null;
    input: unknown;
    output: unknown;
    error: unknown;
    started_at: Date;
    finished_at: Date;
};

export type CheckpointRow = {
    run_id: string;
    step_index: number;
    messages: unknown[];
    finish_reason: string | null;
    created_at: Date;
};
