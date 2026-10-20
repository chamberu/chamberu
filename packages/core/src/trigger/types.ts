/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Artifact } from '../artifact/types.ts';

export type TriggerSource = 'cron' | 'http' | 'webhook' | 'github' | 'mcp';

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

/**
 * Who started a run (or answered an approval), as an authenticator resolved
 * it: a snapshot of identity and grants taken at dispatch, never a token.
 * Revoking a grant later does not reach a run that already holds it.
 */
export type Invoker = {
    id: string;
    /** E.g. 'user', 'robot', 'client', 'token'. */
    kind: string;
    name?: string;
    permissions: readonly string[];
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
    /** Files the run was started with, stored as artifacts of the run; the model gets them as file parts. */
    attachments?: Artifact[];
    /**
     * Who started the run; only ever set from an authenticator (never from a
     * payload). Absent for cron and webhook runs. With an invoker the
     * idempotency key is scoped to it, so only the same invoker's dispatch
     * is deduplicated (and gets its own first run).
     */
    invoker?: Invoker;
    receivedAt: Date;
};
