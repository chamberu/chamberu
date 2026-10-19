/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Run, RunStatusLiteral } from '@chamberu/core';
import type { Principal } from '../auth/types.ts';

/** A run as `list_runs` lists it. */
export type RunSummary = Pick<Run, 'id' | 'agent' | 'status' | 'createdAt' | 'finishedAt' | 'error'>;

/** What `run_<agent>` answers; never carries a resume token. */
export type RunToolResult = {
    runId: string;
    status: RunStatusLiteral;
    deduplicated: boolean;
    output?: unknown;
    error?: { code: string; message: string };
    waiting?: {
        toolName: string;
        input: unknown;
        expiresAt: string;
    };
};

/** Resolved MCP options; internal. */
export type McpEndpointOptions = {
    name: string;
    version: string;
    maxWaitSeconds: number;
};

/** What the route hands each MCP request through `authInfo.extra`; internal. */
export type McpRequestExtra = {
    principal: Principal;
    /** Follows the HTTP request: aborts when the client goes away. */
    signal: AbortSignal;
};
