/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineAgent, http, webhook } from '@chamberu/core';
import {
    ADMIN_TOKEN,
    READER_TOKEN,
    call,
    createTestApp,
} from '../../utils/app.ts';
import { textModel } from '../../utils/model.ts';

const ISSUES = '/hooks/intake/webhook%3A%2Fissues';
const RAW = '/hooks/raw/webhook%3A%2Fraw';

function setup() {
    const agents = [
        defineAgent({
            name: 'intake',
            model: textModel(),
            instructions: 'Intake.',
            triggers: [
                http(),
                webhook({
                    path: '/issues',
                    schema: z.object({ id: z.string() }),
                    idempotencyKey: (p) => `issue-${(p as { id: string }).id}`,
                    concurrencyKey: (p) => (p as { id: string }).id,
                }),
            ],
        }),
        defineAgent({
            name: 'raw',
            model: textModel(),
            instructions: 'Raw.',
            triggers: [webhook({ path: '/raw' })],
        }),
    ];
    return createTestApp({ agents });
}

type Accepted = { runId: string; deduplicated: boolean };

describe('POST /hooks/:agent/:triggerId', () => {
    it('dispatches through the webhook trigger without executing', async () => {
        const { app, store } = setup();
        const response = await call(app, 'POST', ISSUES, { token: ADMIN_TOKEN, body: { id: '7' } });
        expect(response.status).toBe(202);
        const { runId, deduplicated } = await response.json() as Accepted;
        expect(deduplicated).toBe(false);

        const run = await store.getRun(runId);
        expect(run?.status).toBe('queued');
        expect(run?.concurrencyKey).toBe('7');
        expect(run?.trigger).toMatchObject({
            source: 'webhook',
            trigger: 'webhook:/issues',
            idempotencyKey: 'issue-7',
            concurrencyKey: '7',
            payload: { id: '7' },
        });
    });

    it('dedupes a retried delivery by the trigger key', async () => {
        const { app, store } = setup();
        const first = await (await call(app, 'POST', ISSUES, { token: ADMIN_TOKEN, body: { id: '7' } })).json() as Accepted;
        const second = await (await call(app, 'POST', ISSUES, { token: ADMIN_TOKEN, body: { id: '7' } })).json() as Accepted;
        expect(second).toEqual({ runId: first.runId, deduplicated: true });
        expect((await store.listRuns({ agent: 'intake' })).total).toBe(1);
    });

    it('creates one run for parallel deliveries with one Idempotency-Key', async () => {
        const { app, store } = setup();
        const send = (id: string) => call(app, 'POST', ISSUES, {
            token: ADMIN_TOKEN,
            body: { id },
            headers: { 'idempotency-key': 'd-1' },
        });
        // different payload keys: the header wins over idempotencyKey(payload)
        const answers = await Promise.all([send('1'), send('2')]);
        const bodies = await Promise.all(answers.map((r) => r.json() as Promise<Accepted>));
        expect(answers.map((r) => r.status)).toEqual([202, 202]);
        expect(bodies.map((b) => b.deduplicated).sort()).toEqual([false, true]);
        expect(bodies[0]!.runId).toBe(bodies[1]!.runId);

        const { data, total } = await store.listRuns({ agent: 'intake' });
        expect(total).toBe(1);
        expect(data[0]?.trigger.idempotencyKey).toBe('d-1');
    });

    it('validates the payload with the trigger schema', async () => {
        const { app, store } = setup();
        const response = await call(app, 'POST', ISSUES, { token: ADMIN_TOKEN, body: { id: 7 } });
        expect(response.status).toBe(400);
        expect((await response.json()).issues[0].path).toEqual(['id']);
        expect((await store.listRuns({ agent: 'intake' })).total).toBe(0);
    });

    it('needs a JSON body', async () => {
        const { app } = setup();
        const empty = await call(app, 'POST', ISSUES, { token: ADMIN_TOKEN });
        expect(empty.status).toBe(400);
        expect((await empty.json()).message).toBe('The webhook needs a JSON body.');

        const text = await app.fetch(new Request(`http://test${ISSUES}`, {
            method: 'POST',
            headers: { authorization: `Bearer ${ADMIN_TOKEN}`, 'content-type': 'text/plain' },
            body: 'hello',
        }));
        expect(text.status).toBe(415);
    });

    it('rejects an Idempotency-Key header out of bounds', async () => {
        const { app } = setup();
        const response = await call(app, 'POST', ISSUES, {
            token: ADMIN_TOKEN,
            body: { id: '1' },
            headers: { 'idempotency-key': 'x'.repeat(257) },
        });
        expect(response.status).toBe(400);
    });

    it.each([[[1, 2]], [null], ['text'], [5]])('takes any JSON payload without a schema: %j', async (body) => {
        const { app, store } = setup();
        const response = await call(app, 'POST', RAW, { token: ADMIN_TOKEN, body });
        expect(response.status).toBe(202);
        const { runId } = await response.json() as Accepted;
        expect((await store.getRun(runId))?.trigger.payload).toEqual(body);
    });

    it('never reads the body of an unauthenticated request', async () => {
        const { app } = setup();
        const response = await call(app, 'POST', RAW, { body: { blob: 'x'.repeat(2 * 1024 * 1024) } });
        expect(response.status).toBe(401);
    });

    it.each([
        '/hooks/intake/http',
        '/hooks/intake/webhook:/issues',
        '/hooks/nope/x',
    ])('answers 404 for %s', async (path) => {
        const { app } = setup();
        const response = await call(app, 'POST', path, { token: ADMIN_TOKEN, body: { id: '1' } });
        expect(response.status).toBe(404);
    });

    it('names the trigger and agent in the 404', async () => {
        const { app } = setup();
        const response = await call(app, 'POST', '/hooks/intake/http', { token: ADMIN_TOKEN, body: {} });
        expect((await response.json()).message).toBe('No webhook trigger "http" on agent "intake".');
    });

    it('needs agent:<agent>:run', async () => {
        const { app } = setup();
        expect((await call(app, 'POST', ISSUES, { token: READER_TOKEN, body: { id: '1' } })).status).toBe(403);
        expect((await call(app, 'POST', ISSUES, { body: { id: '1' } })).status).toBe(401);
    });
});
