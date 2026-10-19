/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { RunStatus } from '@chamberu/core';
import type { Agent, RunStatusLiteral } from '@chamberu/core';
import { fromJsonSchema } from '@modelcontextprotocol/server';
import type { McpServer } from '@modelcontextprotocol/server';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from '../app/constants.ts';
import type { HttpContext } from '../app/types.ts';
import { agentPermission, hasPermission } from '../auth/module.ts';
import type { Principal } from '../auth/types.ts';
import { KEY_MAX_LENGTH } from '../request/constants.ts';
import { validatePayload } from '../request/helpers.ts';
import {
    assertCanListRuns,
    loadReadableRun,
    serializeRun,
} from '../runs/helpers.ts';
import { MCP_WAIT_POLL_MS } from './constants.ts';
import {
    runTool,
    toJsonSchema,
    toRunToolResult,
    toolResult,
    waitForRun,
} from './helpers.ts';
import type {
    McpEndpointOptions,
    McpRequestExtra,
    RunSummary,
} from './types.ts';

type GetRunArgs = { runId: string };

type RunAgentArgs = {
    payload?: unknown;
    idempotencyKey?: string;
    thread?: string;
    waitSeconds?: number;
};

const DESCRIPTION_MAX_LENGTH = 200;

type ListRunsArgs = {
    agent?: string;
    status?: RunStatusLiteral[];
    limit?: number;
    offset?: number;
};

function summarize(run: RunSummary): RunSummary {
    return {
        id: run.id,
        agent: run.agent,
        status: run.status,
        createdAt: run.createdAt,
        ...(run.finishedAt !== undefined ? { finishedAt: run.finishedAt } : {}),
        ...(run.error !== undefined ? { error: run.error } : {}),
    };
}

function registerReadTools(server: McpServer, ctx: HttpContext, principal: Principal): void {
    server.registerTool('get_run', {
        title: 'Get run',
        description: 'Reads one run: status, output, error and the pending approval, if any.',
        inputSchema: fromJsonSchema<GetRunArgs>({
            type: 'object',
            properties: { runId: { type: 'string', minLength: 1 } },
            required: ['runId'],
            additionalProperties: false,
        }),
        annotations: { readOnlyHint: true },
    }, (args) => runTool(ctx, async () => toolResult(serializeRun(await loadReadableRun(ctx, principal, args.runId)))));

    server.registerTool('list_runs', {
        title: 'List runs',
        description: 'Lists runs, oldest first. Without run:read, agent must name an agent you may run.',
        inputSchema: fromJsonSchema<ListRunsArgs>({
            type: 'object',
            properties: {
                agent: { type: 'string', minLength: 1 },
                status: { type: 'array', items: { type: 'string', enum: Object.values(RunStatus) } },
                limit: {
                    type: 'integer', 
                    minimum: 1, 
                    maximum: MAX_PAGE_LIMIT, 
                },
                offset: { type: 'integer', minimum: 0 },
            },
            additionalProperties: false,
        }),
        annotations: { readOnlyHint: true },
    }, (args) => runTool(ctx, async () => {
        assertCanListRuns(principal, args.agent);
        const { data, total } = await ctx.store.listRuns({
            ...(args.agent !== undefined ? { agent: args.agent } : {}),
            ...(args.status !== undefined ? { status: args.status } : {}),
            limit: args.limit ?? DEFAULT_PAGE_LIMIT,
            offset: args.offset ?? 0,
        });
        return toolResult({ data: data.map(summarize), total });
    }));
}

function describeAgent(agent: Agent): string {
    const [firstLine = ''] = agent.definition.instructions.trim().split('\n');
    return firstLine.trim().slice(0, DESCRIPTION_MAX_LENGTH) || `Starts a run of agent "${agent.name}".`;
}

function registerRunTool(
    server: McpServer,
    ctx: HttpContext,
    agent: Agent,
    extra: McpRequestExtra,
    options: McpEndpointOptions,
): void {
    const trigger = agent.definition.triggers?.find((t) => t.source === 'http');
    if (!trigger || !hasPermission(extra.principal, agentPermission(agent.name, 'run'))) return;
    const schema = trigger.options.schema as StandardSchemaV1 | undefined;

    server.registerTool(`run_${agent.name}`, {
        title: `Run ${agent.name}`,
        description: describeAgent(agent),
        inputSchema: fromJsonSchema<RunAgentArgs>({
            type: 'object',
            properties: {
                payload: toJsonSchema(schema),
                idempotencyKey: {
                    type: 'string',
                    minLength: 1,
                    maxLength: KEY_MAX_LENGTH,
                    description: 'Dedupes starts over MCP; a key used over REST is a different scope.',
                },
                thread: {
                    type: 'string', 
                    minLength: 1, 
                    maxLength: KEY_MAX_LENGTH, 
                },
                waitSeconds: {
                    type: 'integer',
                    minimum: 0,
                    description: `Seconds to wait for the run to finish or pause (at most ${options.maxWaitSeconds}). Default 0.`,
                },
            },
            additionalProperties: false,
        }),
    }, (args, toolCtx) => runTool(ctx, async () => {
        const payload = await validatePayload(schema, args.payload);
        const { runId, deduplicated } = await ctx.engine.dispatch({
            agent: agent.name,
            trigger: trigger.id,
            source: 'mcp',
            payload,
            ...(args.idempotencyKey !== undefined ? { idempotencyKey: args.idempotencyKey } : {}),
            ...(args.thread !== undefined ? { thread: args.thread } : {}),
        });

        const waitSeconds = Math.min(args.waitSeconds ?? 0, options.maxWaitSeconds);
        if (waitSeconds <= 0) {
            const status = deduplicated ? (await ctx.store.getRun(runId))?.status ?? RunStatus.QUEUED : RunStatus.QUEUED;
            return toolResult({
                runId, 
                status, 
                deduplicated, 
            });
        }

        // the HTTP request going away, or an MCP cancel notification
        const signal = AbortSignal.any([extra.signal, toolCtx.mcpReq.signal]);
        const run = await waitForRun(ctx, runId, {
            timeoutMs: waitSeconds * 1_000,
            pollMs: MCP_WAIT_POLL_MS,
            signal,
        });
        return toolResult(toRunToolResult(run, deduplicated));
    }));
}

/** Registers the tools one MCP request's principal sees. */
export function registerTools(
    server: McpServer,
    ctx: HttpContext,
    extra: McpRequestExtra,
    options: McpEndpointOptions,
): void {
    for (const agent of ctx.agents.values()) registerRunTool(server, ctx, agent, extra, options);
    registerReadTools(server, ctx, extra.principal);
}
