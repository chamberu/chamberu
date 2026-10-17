/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Agent, IStore, RunEngine } from '@chamberu/core';

export type SchedulerErrorContext = {
    agent: string;
    trigger: string;
};

export type SchedulerOptions = {
    engine: RunEngine;
    /**
     * The agents whose cron triggers are scheduled. Must be the list the engine
     * was built with: a tick for an agent the engine does not know fails with
     * InvalidAgentDefinitionError, reported to onError.
     */
    agents: Agent[];
    store: IStore;
    /** Lock owner. Default `${hostname()}-${pid}`. */
    owner?: string;
    /**
     * How long a tick's lock key is held; a tick whose timer fires this late or
     * later is skipped. Default SCHEDULE_LOCK_TTL_MS.
     */
    lockTtlMs?: number;
    /**
     * Receives a failing tick (lock store, overlap check or dispatch). Ticks
     * another replica won are not errors and are not reported.
     * Default console.error('[chamberu]', error, ctx).
     */
    onError?: (error: unknown, ctx: SchedulerErrorContext) => void;
};

export interface IScheduler {
    /** Schedules every cron trigger; never fires on start. Idempotent. */
    start(): Promise<void>;
    /** Unschedules every trigger, then waits for ticks in flight. */
    stop(): Promise<void>;
}
