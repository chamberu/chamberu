/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Run, RunStatusLiteral } from '@chamberu/core';

/** A run as it leaves the package (REST, SSE, MCP): without the internal `claim`. */
export type RunView = Omit<Run, 'claim'>;

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
};

/** Body of `POST /resume`; internal. */
export type ResumeBody = {
    token: string;
    approved: boolean;
    reason?: string;
};
