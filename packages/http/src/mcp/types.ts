/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    Agent,
    Run,
    RunStatusLiteral,
    TriggerDefinition,
} from '@chamberu/core';
import type { StandardSchemaWithJSON } from '@modelcontextprotocol/server';
import type { StandardSchemaV1 } from '@standard-schema/spec';
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

/** Options of `waitForRun`; internal. */
export type WaitForRunOptions = {
    timeoutMs: number;
    pollMs: number;
    /** Stops the wait early (the run as stored then is the answer). */
    signal?: AbortSignal;
};

/** The arguments of a `run_<agent>` call; internal. */
export type RunAgentArgs = {
    payload?: unknown;
    idempotencyKey?: string;
    thread?: string;
    waitSeconds?: number;
};

/** A `run_<agent>` tool definition, built once per app; internal. */
export type McpRunTool = {
    agent: Agent;
    trigger: TriggerDefinition;
    schema?: StandardSchemaV1;
    description: string;
    inputSchema: StandardSchemaWithJSON<RunAgentArgs, RunAgentArgs>;
};
