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
import { createResumeToken } from '@chamberu/core';
import {
    ADMIN_TOKEN,
    call,
    createRunTestApp,
    tokenFor,
} from '../../utils/app.ts';
import { callTool, connectMcp, textOf } from '../../utils/mcp.ts';

async function waitingGate() {
    const setup = createRunTestApp();
    const response = await call(setup.app, 'POST', '/agents/gate/runs', { token: ADMIN_TOKEN });
    const { runId } = await response.json() as { runId: string };
    await setup.engine.start();
    await setup.engine.idle();
    expect((await setup.store.getRun(runId))?.status).toBe('waiting');
    return { ...setup, runId };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('mcp resume_run', () => {
    it('resumes a waiting run', async () => {
        const setup = await waitingGate();
        const client = await connectMcp(setup.app, tokenFor('agent:gate:approve'));
        const result = await callTool(client, 'resume_run', { token: setup.notifier.lastToken, approved: true });
        expect(result.isError).toBeFalsy();
        expect(result.structuredContent).toEqual({ runId: setup.runId, status: 'queued' });

        await setup.engine.idle();
        expect((await setup.store.getRun(setup.runId))?.status).toBe('completed');

        const again = await callTool(client, 'resume_run', { token: setup.notifier.lastToken, approved: true });
        expect(again.isError).toBe(true);
        await client.close();
        await setup.engine.drain();
    });

    it('needs agent:<agent>:approve', async () => {
        const setup = await waitingGate();
        const client = await connectMcp(setup.app, tokenFor('agent:echo:approve', 'run:read'));
        const result = await callTool(client, 'resume_run', { token: setup.notifier.lastToken, approved: true });
        expect(result.isError).toBe(true);
        expect(textOf(result)).toBe('Missing permission "agent:gate:approve".');
        expect((await setup.store.getRun(setup.runId))?.status).toBe('waiting');
        await client.close();
        await setup.engine.drain();
    });

    it('rejects a forged token before any store lookup', async () => {
        const setup = await waitingGate();
        const run = await setup.store.getRun(setup.runId);
        const forged = createResumeToken('other', {
            runId: setup.runId,
            approvalId: run!.waiting!.approvalId,
            tokenId: run!.waiting!.tokenId,
            expiresAt: run!.waiting!.expiresAt,
        });
        const client = await connectMcp(setup.app, ADMIN_TOKEN);
        const getRun = vi.spyOn(setup.store, 'getRun');
        const result = await callTool(client, 'resume_run', { token: forged, approved: false });
        expect(result.isError).toBe(true);
        expect(getRun).not.toHaveBeenCalled();
        expect((await setup.store.getRun(setup.runId))?.status).toBe('waiting');
        await client.close();
        await setup.engine.drain();
    });

    it('validates its arguments', async () => {
        const setup = createRunTestApp();
        const client = await connectMcp(setup.app, ADMIN_TOKEN);
        expect((await callTool(client, 'resume_run', { token: 'x', approved: 'yes' })).isError).toBe(true);
        expect((await callTool(client, 'resume_run', {
            token: 'x',
            approved: true,
            reason: 'r'.repeat(1_001),
        })).isError).toBe(true);
        await client.close();
    });
});
