/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import {
    READER_TOKEN,
    call,
    createTestApp,
    tokenFor,
} from '../../utils/app.ts';
import { inventoryAgents } from '../../utils/agents.ts';

describe('GET /agents', () => {
    it('summarizes every agent in definition order', async () => {
        const { app } = createTestApp({ agents: inventoryAgents() });
        const response = await call(app, 'GET', '/agents', { token: READER_TOKEN });
        expect(response.status).toBe(200);
        const { data } = await response.json();
        expect(data).toEqual([
            {
                name: 'echo',
                triggers: [{ source: 'http', id: 'http' }],
                budget: { maxSteps: 20, timeoutMs: 900_000 },
                approvals: [],
                state: [],
            },
            {
                name: 'intake',
                triggers: [{
                    source: 'webhook',
                    id: 'webhook:/issues',
                    hook: '/hooks/intake/issues',
                }],
                budget: { maxSteps: 20, timeoutMs: 900_000 },
                approvals: ['deploy'],
                state: ['issues'],
            },
        ]);
    });

    it('prefixes the hook path with basePath', async () => {
        const { app } = createTestApp({ agents: inventoryAgents(), basePath: '/api' });
        const { data } = await (await call(app, 'GET', '/api/agents', { token: READER_TOKEN })).json();
        expect(data[1].triggers[0].hook).toBe('/api/hooks/intake/issues');
    });

    it('builds the hook path from a basePath given with a trailing slash', async () => {
        const { app } = createTestApp({ agents: inventoryAgents(), basePath: '/api/' });
        const { data } = await (await call(app, 'GET', '/api/agents', { token: READER_TOKEN })).json();
        expect(data[1].triggers[0].hook).toBe('/api/hooks/intake/issues');
    });

    it('needs run:read', async () => {
        const { app } = createTestApp({ agents: inventoryAgents() });
        expect((await call(app, 'GET', '/agents', { token: tokenFor() })).status).toBe(403);
        expect((await call(app, 'GET', '/agents', { token: tokenFor('agent:echo:run') })).status).toBe(403);
        expect((await call(app, 'GET', '/agents')).status).toBe(401);
    });
});
