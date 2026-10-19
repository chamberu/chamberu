/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    afterEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import type * as McpServerModule from '@modelcontextprotocol/server';
import { createShutdown } from '@chamberu/http';
import {
    ADMIN_TOKEN,
    call,
    createRunTestApp,
} from '../../utils/app.ts';
import { callTool, connectMcp } from '../../utils/mcp.ts';

const closes = vi.hoisted(() => [] as Array<ReturnType<typeof vi.fn>>);

vi.mock('@modelcontextprotocol/server', async (importOriginal) => {
    const original = await importOriginal<typeof McpServerModule>();
    return {
        ...original,
        createMcpHandler: (...args: Parameters<typeof original.createMcpHandler>) => {
            const handler = original.createMcpHandler(...args);
            const close = vi.fn(handler.close);
            closes.push(close);
            return { ...handler, close };
        },
    };
});

afterEach(() => {
    closes.length = 0;
});

describe('/mcp', () => {
    it('answers 401 JSON with a bearer challenge before the mcp layer', async () => {
        const { app } = createRunTestApp();
        const response = await call(app, 'POST', '/mcp', {
            body: {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/list',
            },
            headers: { accept: 'application/json, text/event-stream' },
        });
        expect(response.status).toBe(401);
        expect(response.headers.get('www-authenticate')).toBe('Bearer');
        expect(await response.json()).toMatchObject({ status: 401, code: 'unauthorized' });

        await expect(connectMcp(app, undefined)).rejects.toThrow();
    });

    it('mounts nothing with mcp: false', async () => {
        const { app } = createRunTestApp({ mcp: false });
        const response = await call(app, 'POST', '/mcp', { token: ADMIN_TOKEN, body: {} });
        expect(response.status).toBe(404);
        expect(await response.json()).toMatchObject({ code: 'not_found' });
    });

    it('rejects a body over bodyLimit before any tool runs', async () => {
        const { app, store } = createRunTestApp({ bodyLimit: 1_024 });
        const getRun = vi.spyOn(store, 'getRun');
        const client = await connectMcp(app, ADMIN_TOKEN);
        await expect(callTool(client, 'get_run', { runId: 'x'.repeat(2_048) })).rejects.toThrow(/413|large/i);
        expect(getRun).not.toHaveBeenCalled();
        await client.close();
    });

    it('reports its server info', async () => {
        const { app } = createRunTestApp({ mcp: { name: 'ops', version: '1.2.3' } });
        const client = await connectMcp(app, ADMIN_TOKEN);
        expect(client.getServerVersion()).toMatchObject({ name: 'ops', version: '1.2.3' });
        await client.close();
    });

    it('closes the mcp handler on shutdown', async () => {
        const setup = createRunTestApp();
        const shutdown = createShutdown({ engine: setup.engine, clock: setup.clock });
        createRunTestApp({
            shutdown,
            engine: setup.engine,
            store: setup.store,
            clock: setup.clock,
        });
        const close = closes.at(-1)!;
        expect(close).not.toHaveBeenCalled();
        await shutdown.shutdown();
        expect(close).toHaveBeenCalledTimes(1);
    });
});
