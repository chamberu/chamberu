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
    vi,
} from 'vitest';
import { createResumeToken } from '@chamberu/core';
import {
    ADMIN_TOKEN,
    call,
    createRunTestApp,
    tokenFor,
} from '../../utils/app.ts';

async function pausedGate() {
    const ctx = createRunTestApp();
    const response = await call(ctx.app, 'POST', '/agents/gate/runs', { token: ADMIN_TOKEN });
    const { runId } = await response.json() as { runId: string };
    await ctx.engine.start();
    await ctx.engine.idle();
    const run = await ctx.store.getRun(runId);
    expect(run?.status).toBe('waiting');
    return {
        ...ctx,
        runId,
        token: ctx.notifier.lastToken,
        waiting: run!.waiting!,
    };
}

describe('POST /resume', () => {
    it('resumes a waiting run', async () => {
        const {
            app,
            engine,
            store,
            runId,
            token,
        } = await pausedGate();
        const response = await call(app, 'POST', '/resume', { token: ADMIN_TOKEN, body: { token, approved: true } });
        expect(response.status).toBe(202);
        expect(await response.json()).toEqual({ runId, status: 'queued' });
        await engine.idle();
        expect((await store.getRun(runId))?.status).toBe('completed');
        await engine.drain();
    });

    it('authenticates before it looks at the token or the store', async () => {
        const {
            app,
            engine,
            store,
            token,
        } = await pausedGate();
        const getRun = vi.spyOn(store, 'getRun');
        const inspect = vi.spyOn(engine, 'inspectResumeToken');
        const response = await call(app, 'POST', '/resume', { body: { token, approved: true } });
        expect(response.status).toBe(401);
        expect(getRun).not.toHaveBeenCalled();
        expect(inspect).not.toHaveBeenCalled();
        await engine.drain();
    });

    it('rejects forged, malformed and expired tokens before any store lookup', async () => {
        const {
            app,
            engine,
            store,
            clock,
            runId,
            waiting,
        } = await pausedGate();
        const getRun = vi.spyOn(store, 'getRun');
        const claims = {
            runId,
            approvalId: waiting.approvalId,
            tokenId: waiting.tokenId,
        };
        const tokens = [
            'abc',
            createResumeToken('other', { ...claims, expiresAt: waiting.expiresAt }),
            createResumeToken('test-secret', { ...claims, expiresAt: clock.now() }),
        ];
        for (const token of tokens) {
            const response = await call(app, 'POST', '/resume', { token: ADMIN_TOKEN, body: { token, approved: true } });
            expect(response.status).toBe(400);
            expect((await response.json()).code).toBe('invalid_resume_token');
        }
        expect(getRun).not.toHaveBeenCalled();
        await engine.drain();
    });

    it('answers 400 for a signed token of a run that does not exist', async () => {
        const {
            app,
            engine,
            waiting,
        } = await pausedGate();
        const token = createResumeToken('test-secret', {
            runId: 'gone',
            approvalId: waiting.approvalId,
            tokenId: waiting.tokenId,
            expiresAt: waiting.expiresAt,
        });
        const response = await call(app, 'POST', '/resume', { token: ADMIN_TOKEN, body: { token, approved: true } });
        expect(response.status).toBe(400);
        expect((await response.json()).code).toBe('invalid_resume_token');
        await engine.drain();
    });

    it('needs agent:<agent>:approve for the run\'s agent', async () => {
        const {
            app,
            engine,
            store,
            runId,
            token,
        } = await pausedGate();
        const denied = await call(app, 'POST', '/resume', { token: tokenFor('agent:echo:approve'), body: { token, approved: true } });
        expect(denied.status).toBe(403);
        expect((await denied.json()).message).toBe('Missing permission "agent:gate:approve".');
        expect((await store.getRun(runId))?.status).toBe('waiting');

        const allowed = await call(app, 'POST', '/resume', { token: tokenFor('agent:gate:approve'), body: { token, approved: true } });
        expect(allowed.status).toBe(202);

        const again = await call(app, 'POST', '/resume', { token: tokenFor('agent:gate:approve'), body: { token, approved: true } });
        expect(again.status).toBe(409);
        await engine.idle();
        await engine.drain();
    });

    it.each([
        [{ token: 'x', approved: 'yes' }, undefined],
        [[], 'The request body must be a JSON object.'],
        [undefined, 'The request needs a JSON body.'],
        [{
            token: 'x',
            approved: true,
            reason: 'r'.repeat(1_001),
        }, undefined],
        [{ approved: true }, undefined],
    ])('rejects the body %j', async (body, message) => {
        const { app, engine } = createRunTestApp();
        const response = await call(app, 'POST', '/resume', { token: ADMIN_TOKEN, body });
        expect(response.status).toBe(400);
        if (message) expect((await response.json()).message).toBe(message);
        await engine.drain();
    });
});
