/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import {
    Engine,
    InvalidAgentDefinitionError,
    MemoryStore,
    defineAgent,
    http,
} from '@chamvi/core';
import { ControllableClock } from '@chamvi/test-kit';
import { createHttpApp } from '@chamvi/http';
import { textModel } from '../../utils/model.ts';
import {
    ADMIN_TOKEN,
    call,
    testAuth,
} from '../../utils/app.ts';
import { SseReader } from '../../utils/sse.ts';

function setup() {
    const clock = new ControllableClock(new Date(1_000_000));
    const store = new MemoryStore({ clock });
    const agents = [
        defineAgent({
            name: 'echo',
            model: textModel(),
            instructions: 'Echo.',
            triggers: [http()],
        }),
        defineAgent({
            name: 'other',
            model: textModel(),
            instructions: 'Other.',
            triggers: [http()],
        }),
    ];
    const options = {
        store,
        agents,
        resumeSecret: 'test-secret',
        clock,
        onError: () => {},
    };
    const engine = new Engine(options);
    // only the engine knows the store, the agents and the clock
    const app = createHttpApp({
        engine,
        auth: testAuth,
        metrics: false,
        rateLimit: false,
    });
    return {
        app,
        engine,
        store,
        clock,
        options,
    };
}

describe('createHttpApp over the engine', () => {
    it('serves the engine\'s agents', async () => {
        const { app } = setup();
        const response = await call(app, 'GET', '/agents', { token: ADMIN_TOKEN });
        expect(response.status).toBe(200);
        const { data } = await response.json() as { data: { name: string }[] };
        expect(data.map((agent) => agent.name)).toEqual(['echo', 'other']);
        expect((await call(app, 'POST', '/agents/other/runs', { token: ADMIN_TOKEN })).status).toBe(202);
    });

    it('reads runs from the engine\'s store', async () => {
        const { app, engine } = setup();
        const { runId } = await engine.dispatch({
            agent: 'echo',
            trigger: 'http',
            source: 'http',
            payload: {},
        });
        const response = await call(app, 'GET', `/runs/${runId}`, { token: ADMIN_TOKEN });
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ id: runId, status: 'queued' });
    });

    it('polls the stream on the engine\'s clock', async () => {
        const {
            app,
            clock,
            options,
        } = setup();
        const started = await call(app, 'POST', '/agents/echo/runs', { token: ADMIN_TOKEN });
        const { runId } = await started.json() as { runId: string };
        const reader = new SseReader(await call(app, 'GET', `/runs/${runId}/stream`, { token: ADMIN_TOKEN }));
        await reader.next(1);

        // another replica runs it: only the store poll sees the change
        const other = new Engine({ ...options, owner: 'replica-b' });
        await other.start();
        await other.idle();
        clock.advance(2_000);
        const events = await reader.rest();
        const statuses = events
            .filter((event) => event.event === 'run.updated')
            .map((event) => (JSON.parse(event.data) as { status: string }).status);
        expect(statuses).toContain('completed');
        await other.drain();
    });

    it('serves only the named agents', async () => {
        const { engine } = setup();
        const app = createHttpApp({
            engine,
            agents: ['echo'],
            auth: testAuth,
            metrics: false,
            rateLimit: false,
        });
        const response = await call(app, 'GET', '/agents', { token: ADMIN_TOKEN });
        const { data } = await response.json() as { data: { name: string }[] };
        expect(data.map((agent) => agent.name)).toEqual(['echo']);
        expect((await call(app, 'POST', '/agents/other/runs', { token: ADMIN_TOKEN })).status).toBe(404);
        expect((await call(app, 'GET', '/agents/other/state/kv/k', { token: ADMIN_TOKEN })).status).toBe(404);
        expect((await call(app, 'POST', '/agents/echo/runs', { token: ADMIN_TOKEN })).status).toBe(202);
    });

    it('rejects an agent name the engine lacks or a name given twice', () => {
        const { engine } = setup();
        const make = (agents: string[]) => createHttpApp({
            engine,
            agents,
            auth: testAuth,
            metrics: false,
            rateLimit: false,
        });
        expect(() => make(['missing'])).toThrow(InvalidAgentDefinitionError);
        expect(() => make(['echo', 'echo'])).toThrow(InvalidAgentDefinitionError);
    });
});
