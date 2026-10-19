/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineAgent, http } from '@chamberu/core';
import {
    ADMIN_TOKEN,
    READER_TOKEN,
    call,
    createRunAgents,
    createRunTestApp,
} from '../../utils/app.ts';
import { textModel } from '../../utils/model.ts';

describe('POST /agents/:name/runs', () => {
    it('dispatches through the http trigger', async () => {
        const { app, store } = createRunTestApp();
        const response = await call(app, 'POST', '/agents/echo/runs', { token: ADMIN_TOKEN, body: { payload: { n: 1 } } });
        expect(response.status).toBe(202);
        const body = await response.json() as { runId: string; deduplicated: boolean };
        expect(body).toEqual({ runId: expect.any(String), deduplicated: false });

        const run = await store.getRun(body.runId);
        expect(run?.trigger).toMatchObject({
            source: 'http',
            trigger: 'http',
            payload: { n: 1 },
        });
    });

    it('accepts an empty body', async () => {
        const { app, store } = createRunTestApp();
        const response = await call(app, 'POST', '/agents/echo/runs', { token: ADMIN_TOKEN });
        expect(response.status).toBe(202);
        const { runId } = await response.json() as { runId: string };
        expect((await store.getRun(runId))?.trigger.payload).toBeUndefined();
    });

    it('dedupes by idempotencyKey in the body', async () => {
        const { app } = createRunTestApp();
        const first = await (await call(app, 'POST', '/agents/echo/runs', { token: ADMIN_TOKEN, body: { idempotencyKey: 'k1' } })).json();
        const second = await (await call(app, 'POST', '/agents/echo/runs', { token: ADMIN_TOKEN, body: { idempotencyKey: 'k1' } })).json();
        expect(second).toEqual({ runId: first.runId, deduplicated: true });
    });

    it('dedupes by the Idempotency-Key header', async () => {
        const { app } = createRunTestApp();
        const headers = { 'idempotency-key': 'h1' };
        const first = await (await call(app, 'POST', '/agents/echo/runs', { token: ADMIN_TOKEN, headers })).json();
        const second = await (await call(app, 'POST', '/agents/echo/runs', { token: ADMIN_TOKEN, headers })).json();
        expect(second).toEqual({ runId: first.runId, deduplicated: true });
    });

    it('rejects an Idempotency-Key header out of bounds', async () => {
        const { app } = createRunTestApp();
        const response = await call(app, 'POST', '/agents/echo/runs', { token: ADMIN_TOKEN, headers: { 'idempotency-key': 'x'.repeat(257) } });
        expect(response.status).toBe(400);
    });

    it('answers 404 for an unknown agent', async () => {
        const { app } = createRunTestApp();
        const response = await call(app, 'POST', '/agents/nope/runs', { token: ADMIN_TOKEN });
        expect(response.status).toBe(404);
        expect((await response.json()).message).toBe('Agent "nope" was not found.');
    });

    it.each(['sweep', 'hooked'])('answers 404 for %s, which declares no http() trigger', async (name) => {
        const { app } = createRunTestApp();
        const response = await call(app, 'POST', `/agents/${name}/runs`, { token: ADMIN_TOKEN });
        expect(response.status).toBe(404);
        expect((await response.json()).message).toBe(`Agent "${name}" declares no http() trigger.`);
    });

    it('needs agent:<name>:run', async () => {
        const { app } = createRunTestApp();
        expect((await call(app, 'POST', '/agents/echo/runs', { token: READER_TOKEN })).status).toBe(403);
        expect((await call(app, 'POST', '/agents/echo/runs')).status).toBe(401);
    });

    it('never reads the body of an unauthenticated request', async () => {
        const { app } = createRunTestApp();
        const response = await call(app, 'POST', '/agents/echo/runs', { body: { payload: 'x'.repeat(2 * 1024 * 1024) } });
        expect(response.status).toBe(401);
    });

    it.each([[[1]], ['str'], [null]])('rejects the body %j', async (body) => {
        const { app } = createRunTestApp();
        const response = await call(app, 'POST', '/agents/echo/runs', { token: ADMIN_TOKEN, body });
        expect(response.status).toBe(400);
        expect((await response.json()).message).toBe('The request body must be a JSON object.');
    });

    it('rejects an empty idempotencyKey', async () => {
        const { app } = createRunTestApp();
        const response = await call(app, 'POST', '/agents/echo/runs', { token: ADMIN_TOKEN, body: { idempotencyKey: '' } });
        expect(response.status).toBe(400);
        expect((await response.json()).issues[0].path).toEqual(['idempotencyKey']);
    });

    it('drops unknown body keys', async () => {
        const { app } = createRunTestApp();
        const response = await call(app, 'POST', '/agents/echo/runs', { token: ADMIN_TOKEN, body: { extra: 1 } });
        expect(response.status).toBe(202);
    });

    it('validates the payload with the trigger schema', async () => {
        const typed = defineAgent({
            name: 'typed',
            model: textModel(),
            instructions: 'Typed.',
            triggers: [http({ schema: z.object({ n: z.number() }) })],
        });
        const { app, store } = createRunTestApp({ agents: [...createRunAgents(), typed] });
        const response = await call(app, 'POST', '/agents/typed/runs', { token: ADMIN_TOKEN, body: { payload: { n: 'x' } } });
        expect(response.status).toBe(400);
        expect((await response.json()).issues[0].path).toEqual(['n']);
        expect((await store.listRuns({ agent: 'typed' })).total).toBe(0);
    });
});
