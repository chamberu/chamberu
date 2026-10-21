/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { RunStatusLiteral, TriggerSource } from '@chamvi/core';
import type { RunWire, ScheduleWire } from '../api/types.ts';

export type TriggerChip = {
    source: TriggerSource;
    id: string;
    /** The event names, cron expression or hook path. */
    detail?: string;
    hook?: string;
};

export type ActivityMark = {
    id: string;
    status: RunStatusLiteral;
    /** Position on the strip in percent, 0 the window start, 100 now. */
    left: number;
};

export type Activity = {
    /** Runs created inside the window, as far as the runs read reach. */
    count: number;
    /** The read limit was reached inside the window: there may be more runs. */
    saturated: boolean;
    marks: ActivityMark[];
    failed: number;
    lastFailed?: RunWire;
    tokens: number;
    runs: RunWire[];
};

export type AgentRollup = {
    running: number;
    waiting: number;
    last?: RunWire;
    nextFire?: ScheduleWire;
    activity: Activity;
};

export type PayloadResult = { ok: true; value: unknown } | { ok: false; message: string };
