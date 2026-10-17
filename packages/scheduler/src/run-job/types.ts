/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    Agent,
    IClock,
    IStore,
    RunEngine,
    RunStatusLiteral,
} from '@chamberu/core';

export type RunJobOptions = {
    /** Not started yet; runJob starts and drains it. */
    engine: RunEngine;
    store: IStore;
    agent: Agent;
    /** Cron trigger id; optional when the agent has exactly one cron trigger. */
    trigger?: string;
    /** Default systemClock; gives scheduledAt and drives the poll. */
    clock?: IClock;
    /** Fallback poll of engine.getRun, default 1_000. */
    pollMs?: number;
    /** Passed to engine.drain, default 30_000. */
    drainTimeoutMs?: number;
};

export type RunJobResult = {
    runId?: string;
    /** The run's status when the job returned, or 'skipped' (overlap). */
    status: RunStatusLiteral | 'skipped';
    /** 0 for completed, waiting and skipped; 1 for failed and cancelled. */
    exitCode: 0 | 1;
};
