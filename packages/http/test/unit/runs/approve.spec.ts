/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    describe,
    expect,
    it,
} from 'vitest';
import {
    ADMIN_TOKEN,
    call,
    createRunTestApp,
    tokenFor,
} from '../../utils/app.ts';
import type { TestAppOverrides } from '../../utils/app.ts';

async function pausedGate(overrides: TestAppOverrides = {}) {
    const ctx = createRunTestApp(overrides);
    const response = await call(ctx.app, 'POST', '/agents/gate/runs', { token: ADMIN_TOKEN });
    const { runId } = await response.json() as { runId: string };
    await ctx.engine.start();
    await ctx.engine.idle();
    const run = await ctx.store.getRun(runId);
    expect(run?.status).toBe('waiting');
    return {
        ...ctx,
        runId,
        token: await ctx.tokenOf(runId),
        waiting: run!.waiting!,
    };
}

describe('POST /runs/:id/approve', () => {
    it('approves the current wait point and records the approver', async () => {
        const {
            app,
            engine,
            store,
            runId,
            waiting,
        } = await pausedGate();
        const approver = tokenFor('agent:gate:approve', 'run:read');
        const response = await call(app, 'POST', `/runs/${runId}/approve`, {
            token: approver,
            body: { approvalId: waiting.approvalId, approved: true },
        });
        expect(response.status).toBe(202);
        expect(await response.json()).toEqual({ runId, status: 'queued' });
        await engine.idle();
        expect((await store.getRun(runId))?.status).toBe('completed');

        const detail = await (await call(app, 'GET', `/runs/${runId}`, { token: approver })).json() as {
            steps: Array<{ kind: string; output: unknown }>;
        };
        const wait = detail.steps.find((step) => step.kind === 'wait');
        expect(wait?.output).toEqual({
            approvalId: waiting.approvalId,
            approved: true,
            approver: { id: 'p:agent:gate:approve,run:read', kind: 'token' },
        });
        await engine.drain();
    });

    it('denies with a reason', async () => {
        const {
            app,
            engine,
            store,
            runId,
            waiting,
        } = await pausedGate();
        const response = await call(app, 'POST', `/runs/${runId}/approve`, {
            token: ADMIN_TOKEN,
            body: {
                approvalId: waiting.approvalId, 
                approved: false, 
                reason: 'not now', 
            },
        });
        expect(response.status).toBe(202);
        await engine.idle();
        const steps = await store.listSteps(runId);
        expect(steps.find((step) => step.kind === 'wait')?.output).toMatchObject({ approved: false, reason: 'not now' });
        expect((await store.getRun(runId))?.status).toBe('completed');
        await engine.drain();
    });

    it('409 for a stale approvalId', async () => {
        const {
            app,
            engine,
            store,
            runId,
        } = await pausedGate();
        const response = await call(app, 'POST', `/runs/${runId}/approve`, {
            token: ADMIN_TOKEN,
            body: { approvalId: 'other', approved: true },
        });
        expect(response.status).toBe(409);
        expect((await response.json()).code).toBe('invalid_run_state');
        expect((await store.getRun(runId))?.status).toBe('waiting');
        await engine.drain();
    });

    it('409 for a run that is not waiting', async () => {
        const {
            app,
            engine,
            runId,
            waiting,
        } = await pausedGate();
        const body = { approvalId: waiting.approvalId, approved: true };
        expect((await call(app, 'POST', `/runs/${runId}/approve`, { token: ADMIN_TOKEN, body })).status).toBe(202);
        await engine.idle();
        const again = await call(app, 'POST', `/runs/${runId}/approve`, { token: ADMIN_TOKEN, body });
        expect(again.status).toBe(409);
        expect((await again.json()).code).toBe('invalid_run_state');
        await engine.drain();
    });

    it('404 before 403', async () => {
        const { app, engine } = createRunTestApp();
        const response = await call(app, 'POST', '/runs/unknown/approve', {
            token: tokenFor('run:read'),
            body: { approvalId: 'a', approved: true },
        });
        expect(response.status).toBe(404);
        await engine.drain();
    });

    it('401 without credentials', async () => {
        const {
            app, 
            engine, 
            runId, 
        } = await pausedGate();
        const response = await call(app, 'POST', `/runs/${runId}/approve`, { body: { approvalId: 'a', approved: true } });
        expect(response.status).toBe(401);
        await engine.drain();
    });

    it('403 without agent:<agent>:approve', async () => {
        const {
            app,
            engine,
            store,
            runId,
            waiting,
        } = await pausedGate();
        const response = await call(app, 'POST', `/runs/${runId}/approve`, {
            token: tokenFor('agent:gate:run', 'run:read'),
            body: { approvalId: waiting.approvalId, approved: true },
        });
        expect(response.status).toBe(403);
        expect((await response.json()).message).toBe('Missing permission "agent:gate:approve".');
        expect((await store.getRun(runId))?.status).toBe('waiting');
        await engine.drain();
    });

    it('authorizes before reading the body', async () => {
        const {
            app, 
            engine, 
            runId, 
        } = await pausedGate({ bodyLimit: 1024 });
        const response = await call(app, 'POST', `/runs/${runId}/approve`, {
            token: tokenFor('run:read'),
            body: { approvalId: 'a'.repeat(4096), approved: true },
        });
        expect(response.status).toBe(403);
        await engine.drain();
    });

    it.each([
        [{ approved: true }],
        [{ approvalId: 'a\u0000b', approved: true }],
        [{ approvalId: '', approved: true }],
        [{ approvalId: 'a'.repeat(256), approved: true }],
        [{ approvalId: 'a', approved: 'yes' }],
        [{
            approvalId: 'a', 
            approved: true, 
            reason: 'r'.repeat(1_001), 
        }],
    ])('400 for body %#', async (body) => {
        const {
            app,
            engine,
            store,
            runId,
        } = await pausedGate();
        const response = await call(app, 'POST', `/runs/${runId}/approve`, { token: ADMIN_TOKEN, body });
        expect(response.status).toBe(400);
        expect((await store.getRun(runId))?.status).toBe('waiting');
        await engine.drain();
    });

    it('the notified resume token is spent after approve', async () => {
        const {
            app,
            engine,
            runId,
            token,
            waiting,
        } = await pausedGate();
        await call(app, 'POST', `/runs/${runId}/approve`, {
            token: ADMIN_TOKEN,
            body: { approvalId: waiting.approvalId, approved: true },
        });
        await engine.idle();
        const response = await call(app, 'POST', '/resume', { token: ADMIN_TOKEN, body: { token, approved: true } });
        expect(response.status).toBe(409);
        await engine.drain();
    });
});
