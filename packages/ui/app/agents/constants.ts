/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** The activity window of the agent cards and stat tiles. */
export const ACTIVITY_WINDOW_MS = 24 * 3_600_000;

/**
 * The newest runs read per agent for the activity window: the API has no time
 * filter, so the window is exact up to this many runs and shown as "100+" beyond.
 */
export const ACTIVITY_LIMIT = 100;

export const AGENTS_POLL_MS = 15_000;

export const RECENT_RUNS = 5;

/** Waiting runs read for the agent page's approvals panel. */
export const AGENT_WAITING_LIMIT = 20;
