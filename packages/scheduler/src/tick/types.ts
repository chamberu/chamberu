/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    Agent,
    Engine,
    OverlapPolicy,
    TriggerDefinition,
} from '@chamvi/core';

export type CronTriggerOptions = {
    expression: string;
    timezone?: string;
    overlap: OverlapPolicy;
    payload?: unknown;
};

export type CronTickContext = {
    engine: Engine;
    agent: Agent;
    trigger: TriggerDefinition;
    /** The tick's planned fire time; forms the idempotency key. */
    scheduledAt: Date;
};

export type CronTickDispatched = {
    dispatched: true;
    runId: string;
    deduplicated: boolean;
};

export type CronTickSkipped = {
    dispatched: false;
    reason: 'overlap';
};

export type CronTickResult = CronTickDispatched | CronTickSkipped;
