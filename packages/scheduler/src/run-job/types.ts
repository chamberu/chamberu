/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    Agent,
    Engine,
    RunStatusLiteral,
} from '@chamberu/core';

export type RunJobOptions = {
    /**
     * Not started yet; runJob starts and drains it, also when the tick is
     * skipped. Its store is polled and its clock gives scheduledAt and drives
     * the poll.
     */
    engine: Engine;
    agent: Agent;
    /** Cron trigger id; optional when the agent has exactly one cron trigger. */
    trigger?: string;
    /** Fallback poll of engine.getRun, default 1_000. */
    pollMs?: number;
    /** Passed to engine.drain, default 30_000. */
    drainTimeoutMs?: number;
};

export type RunJobResult = {
    runId?: string;
    /**
     * The run's status when the job returned: `completed`, `failed`,
     * `cancelled`, `waiting`, `queued` (behind a run of its concurrency key
     * that waits for an approval), or 'skipped' (overlap).
     */
    status: RunStatusLiteral | 'skipped';
    /** 0 for completed, waiting, queued and skipped; 1 for failed and cancelled. */
    exitCode: 0 | 1;
};
