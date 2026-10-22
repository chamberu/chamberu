/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Budget, OverlapPolicy, TriggerSource } from '@chamvi/core';

// #region summaries
/** An agent as `GET /agents` lists it. */
export type AgentSummary = {
    name: string;
    /** `hook` is the ready-made path of a `webhook()` trigger. */
    triggers: Array<{
        source: TriggerSource;
        id: string;
        hook?: string
    }>;
    budget: Budget;
    /** Tool names that need an approval. */
    approvals: string[];
    /** Declared state collections. */
    state: string[];
    notify?: string;
};

/** An agent that failed to load, as `GET /agents` lists it next to the agents. */
export type AgentIssue = {
    agent: string;
    message: string;
    at: Date;
};

/** A `cron()` trigger as `GET /schedules` lists it (definitions only, not scheduler health). */
export type ScheduleSummary = {
    agent: string;
    trigger: string;
    expression: string;
    timezone?: string;
    overlap: OverlapPolicy;
    /** ISO time of the next fire after now. */
    nextAt: string;
};

// #endregion summaries

/** Body of `PATCH /agents/:name/state/kv/:key`; internal. */
export type KvBody = {
    value: unknown;
};
