/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export type SchedulerModuleOptions = {
    /** Names of the agents to schedule; default every agent. */
    agents?: string[];
    /** Lock owner; default the scheduler's `${hostname}-${pid}`. */
    owner?: string;
    /** Default the scheduler's SCHEDULE_LOCK_TTL_MS. */
    lockTtlMs?: number;
};
