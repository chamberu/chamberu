/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import type { McpHttpHandler } from '@modelcontextprotocol/server';
import { UnauthorizedError } from '@ebec/http';
import { defineCoreHandler } from 'routup';
import type { App } from 'routup';
import { refuseWhenClosed } from '../app/helpers.ts';
import type { HttpContext, McpOptions } from '../app/types.ts';
import { authenticate } from '../auth/helpers.ts';
import {
    DEFAULT_MCP_MAX_WAIT_SECONDS,
    DEFAULT_MCP_NAME,
    DEFAULT_MCP_VERSION,
} from './constants.ts';
import { readRequestExtra } from './helpers.ts';
import { buildRunTools, registerTools } from './tools.ts';
import type { McpEndpointOptions, McpRequestExtra } from './types.ts';

/**
 * The MCP handler: one McpServer per request, with the tools the request's
 * principal (from `authInfo.extra`) may use; tool definitions are built once. Bodies are bounded by
 * `bodyLimit`, like REST.
 */
export function createMcpEndpoint(ctx: HttpContext, options: McpEndpointOptions): McpHttpHandler {
    const runTools = buildRunTools(ctx.agents.values(), options);
    return createMcpHandler(({ authInfo }) => {
        const extra = readRequestExtra(authInfo?.extra);
        // the route always passes them; a request without them cannot reach here
        if (!extra) throw new UnauthorizedError({ message: 'Authentication required.' });
        const server = new McpServer({ name: options.name, version: options.version });
        registerTools(server, ctx, runTools, extra, options);
        return server;
    }, { maxRequestBodySize: ctx.bodyLimit });
}

/** Mounts the MCP endpoint at `/mcp` (authenticated); the app's shutdown hook closes it. */
export function registerMcpRoutes(app: App, ctx: HttpContext, options: McpOptions = {}): void {
    const handler = createMcpEndpoint(ctx, {
        name: options.name ?? DEFAULT_MCP_NAME,
        version: options.version ?? DEFAULT_MCP_VERSION,
        maxWaitSeconds: options.maxWaitSeconds ?? DEFAULT_MCP_MAX_WAIT_SECONDS,
    });

    app.use('/mcp', defineCoreHandler(async (event) => {
        const principal = await authenticate(event, ctx);
        const refused = refuseWhenClosed(event, ctx);
        if (refused) return refused;
        // event.request.signal is the only signal that follows the HTTP request
        const extra: McpRequestExtra = { principal, signal: event.request.signal };
        return handler.fetch(event.request, {
            authInfo: {
                token: '',
                clientId: principal.id,
                scopes: [...principal.permissions],
                extra,
            },
        });
    }));

    ctx.closers.add(() => handler.close());
}
