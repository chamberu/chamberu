/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { StandardSchemaV1 } from '@standard-schema/spec';

export type TriggerSource = 'cron' | 'http' | 'github' | 'mcp' | 'manual';
export type OverlapPolicy = 'skip' | 'queue-one' | 'allow';

export type TriggerDefinition<P = unknown> = {
    source: TriggerSource;
    /** Unique within an agent, e.g. 'cron:*\/30 * * * *'. */
    id: string;
    /** Source-specific (cron: { expression, timezone?, overlap }). */
    options: Record<string, unknown>;
    // method signatures (bivariant): a TriggerDefinition<P> fits AgentDefinition.triggers
    concurrencyKey?(payload: P): string | undefined;
    idempotencyKey?(payload: P): string | undefined;
};

export type TriggerEnvelope<P = unknown> = {
    id: string;
    agent: string;
    trigger: string;
    source: TriggerSource;
    payload: P;
    idempotencyKey?: string;
    concurrencyKey?: string;
    thread?: string;
    receivedAt: Date;
};

export type CronOptions = {
    timezone?: string;
    overlap?: OverlapPolicy;
    payload?: unknown;
};

export type HttpTriggerOptions = {
    path?: string;
    schema?: StandardSchemaV1;
};

export type ManualTriggerOptions = {
    schema?: StandardSchemaV1;
};
