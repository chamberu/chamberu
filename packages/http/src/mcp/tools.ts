/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { RunStatus } from '@chamberu/core';
import type { RunStatusLiteral } from '@chamberu/core';
import { fromJsonSchema } from '@modelcontextprotocol/server';
import type { McpServer } from '@modelcontextprotocol/server';
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from '../app/constants.ts';
import type { HttpContext } from '../app/types.ts';
import type { Principal } from '../auth/types.ts';
import {
    assertCanListRuns,
    loadReadableRun,
    serializeRun,
} from '../runs/helpers.ts';
import { runTool, toolResult } from './helpers.ts';
import type { McpRequestExtra, RunSummary } from './types.ts';

type GetRunArgs = { runId: string };

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

/** Registers the tools one MCP request's principal sees. */
export function registerTools(server: McpServer, ctx: HttpContext, extra: McpRequestExtra): void {
    registerReadTools(server, ctx, extra.principal);
}
