/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    ArtifactInput,
    Invoker,
    Run,
    RunStatusLiteral,
    TriggerEnvelope,
} from '@chamberu/core';

/** An invoker or approver as it leaves the package: identity only, never the grants. */
export type InvokerView = Omit<Invoker, 'permissions'>;

/**
 * A run as it leaves the package (REST, SSE, MCP): without the internal
 * `claim`, and the invoker without its `permissions`.
 */
export type RunView = Omit<Run, 'claim' | 'trigger'> & {
    trigger: Omit<TriggerEnvelope, 'invoker'> & { invoker?: InvokerView };
};

/** `GET /runs` query after decoding. */
export type RunListQuery = {
    agent?: string;
    status?: RunStatusLiteral[];
    limit: number;
    offset: number;
};

/** Body of `POST /agents/:name/runs`; internal. */
export type StartRunBody = {
    payload?: unknown;
    idempotencyKey?: string;
    thread?: string;
    /** Decoded from base64 by the validator; unknown item keys are dropped by the route. */
    attachments?: ArtifactInput[];
};

/** Body of `POST /resume`; internal. */
export type ResumeBody = {
    token: string;
    approved: boolean;
    reason?: string;
};
