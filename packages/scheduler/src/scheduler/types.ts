/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Engine } from '@chamvi/core';

export type SchedulerErrorContext = {
    agent: string;
    trigger: string;
};

export type SchedulerOptions = {
    /** Its agents' cron triggers are scheduled; its store holds the tick locks. */
    engine: Engine;
    /**
     * Names of the engine's agents to schedule, e.g. to split cron triggers
     * across deployments. Default: every agent of the engine.
     */
    agents?: string[];
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
     * Default console.error('[chamvi]', error, ctx).
     */
    onError?: (error: unknown, ctx: SchedulerErrorContext) => void;
};

export interface IScheduler {
    /** Schedules every cron trigger; never fires on start. Idempotent; does nothing after stop(). */
    start(): Promise<void>;
    /**
     * Stops following agent changes, unschedules every trigger, then waits for
     * ticks in flight (also of replaced and removed agents). Idempotent.
     */
    stop(): Promise<void>;
}
