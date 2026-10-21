/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { effectScope, ref } from 'vue';
import { createResumeToken } from '../../../../../core/src/approval/module.ts';
import type { ApproveBody, ResumeBody, RunListFilter } from '../../../../app/api/types.ts';
import { RESUME_STORAGE_KEY } from '../../../../app/approvals/constants.ts';
import { useApprovals, useDeepLinkApproval } from '../../../../app/approvals/composables.ts';
import { apiError, fakeClient } from '../../../utils/client.ts';
import { wireRun } from '../../../utils/runs.ts';
import { MemoryStorage } from '../../../utils/storage.ts';
import { flush } from '../../../utils/timers.ts';

const waitingRun = (id = 'r1', approvalId = 'a1') => wireRun({
    id,
    status: 'waiting',
    waiting: {
        kind: 'approval',
        approvalId,
        toolName: 'deploy',
        input: { env: 'prod' },
        expiresAt: '2026-10-22T10:00:00.000Z',
        tokenId: 't1',
    },
});

function inboxClient(approve: (id: string, body: ApproveBody) => Promise<void>) {
    const queries: RunListFilter[] = [];
    let lists = 0;
    const client = fakeClient({
        listRuns: async (filter) => {
            queries.push(filter);
            lists++;
            return {
                data: [waitingRun()],
                meta: {
                    total: 1,
                    limit: 100,
                    offset: 0,
                },
            };
        },
        approve,
    });
    return {
        client,
        queries,
        lists: () => lists,
    };
}

describe('useApprovals', () => {
    it('lists the waiting runs newest first', async () => {
        const { client, queries } = inboxClient(async () => {});
        const scope = effectScope();
        const inbox = scope.run(() => useApprovals(client))!;
        await flush();
        expect(queries[0]).toEqual({
            status: ['waiting'],
            limit: 100,
            offset: 0,
        });
        expect(inbox.runs.value.map((run) => run.id)).toEqual(['r1']);
        scope.stop();
    });

    it('answer approves the current approval id', async () => {
        const answered: Array<[string, ApproveBody]> = [];
        const { client } = inboxClient(async (id, body) => { answered.push([id, body]); });
        const scope = effectScope();
        const inbox = scope.run(() => useApprovals(client))!;
        await flush();
        expect(await inbox.answer(waitingRun(), false, 'not now')).toBe('answered');
        expect(answered).toEqual([['r1', {
            approvalId: 'a1',
            approved: false,
            reason: 'not now',
        }]]);
        expect(await inbox.answer(waitingRun(), true, '  ')).toBe('answered');
        expect(answered[1]).toEqual(['r1', { approvalId: 'a1', approved: true }]);
        scope.stop();
    });

    it('answer maps 409 to an already-answered result and refreshes', async () => {
        const { client, lists } = inboxClient(async () => { throw apiError(409, 'invalid_run_state'); });
        const scope = effectScope();
        const inbox = scope.run(() => useApprovals(client))!;
        await flush();
        const before = lists();
        expect(await inbox.answer(waitingRun(), true)).toBe('already-answered');
        expect(lists()).toBe(before + 1);
        scope.stop();
    });

    it('answer maps 403 to forbidden', async () => {
        const { client } = inboxClient(async () => { throw apiError(403, 'forbidden'); });
        const scope = effectScope();
        const inbox = scope.run(() => useApprovals(client))!;
        await flush();
        expect(await inbox.answer(waitingRun(), true)).toBe('forbidden');
        scope.stop();
    });

    it('answer rethrows anything else', async () => {
        const { client } = inboxClient(async () => { throw apiError(500, 'boom'); });
        const scope = effectScope();
        const inbox = scope.run(() => useApprovals(client))!;
        await flush();
        await expect(inbox.answer(waitingRun(), true)).rejects.toMatchObject({ status: 500 });
        scope.stop();
    });

    it('keeps a 403 listing as error', async () => {
        const client = fakeClient({ listRuns: async () => { throw apiError(403, 'forbidden'); } });
        const scope = effectScope();
        const inbox = scope.run(() => useApprovals(client))!;
        await flush();
        expect(inbox.error.value?.status).toBe(403);
        expect(inbox.runs.value).toEqual([]);
        scope.stop();
    });
});

describe('useDeepLinkApproval', () => {
    const token = createResumeToken('secret', {
        runId: 'r1',
        approvalId: 'a1',
        tokenId: 't1',
        expiresAt: new Date(Date.now() + 60_000),
    });

    it('deep link answers through resume and clears the stored token', async () => {
        const storage = new MemoryStorage();
        storage.setItem(RESUME_STORAGE_KEY, token);
        const resumed: ResumeBody[] = [];
        const client = fakeClient({
            getRun: async () => ({ ...waitingRun(), steps: [] }),
            resume: async (body) => {
                resumed.push(body);
                return { runId: 'r1' };
            },
        });
        const scope = effectScope();
        const link = scope.run(() => useDeepLinkApproval(client, ref(token), storage))!;
        await flush();
        expect(link.claims.value).toEqual({ runId: 'r1', approvalId: 'a1' });
        expect(link.run.value?.id).toBe('r1');
        expect(await link.answer(false, 'no')).toBe('answered');
        expect(resumed).toEqual([{
            token,
            approved: false,
            reason: 'no',
        }]);
        expect(storage.getItem(RESUME_STORAGE_KEY)).toBeNull();
        scope.stop();
    });

    it('shows the decoded ids when the run is not readable', async () => {
        const client = fakeClient({ getRun: async () => { throw apiError(403, 'forbidden'); } });
        const scope = effectScope();
        const link = scope.run(() => useDeepLinkApproval(client, ref(token), new MemoryStorage()))!;
        await flush();
        expect(link.run.value).toBeUndefined();
        expect(link.claims.value?.runId).toBe('r1');
        scope.stop();
    });

    it('deep link maps an invalid token to already-answered', async () => {
        for (const error of [apiError(400, 'invalid_resume_token'), apiError(409, 'invalid_run_state')]) {
            const storage = new MemoryStorage();
            storage.setItem(RESUME_STORAGE_KEY, token);
            const client = fakeClient({
                getRun: async () => ({ ...waitingRun(), steps: [] }),
                resume: async () => { throw error; },
            });
            const scope = effectScope();
            const link = scope.run(() => useDeepLinkApproval(client, ref(token), storage))!;
            await flush();
            expect(await link.answer(true)).toBe('already-answered');
            expect(storage.getItem(RESUME_STORAGE_KEY)).toBeNull();
            scope.stop();
        }
    });

    it('deep link maps 403 to forbidden and keeps the token', async () => {
        const storage = new MemoryStorage();
        storage.setItem(RESUME_STORAGE_KEY, token);
        const client = fakeClient({
            getRun: async () => ({ ...waitingRun(), steps: [] }),
            resume: async () => { throw apiError(403, 'forbidden'); },
        });
        const scope = effectScope();
        const link = scope.run(() => useDeepLinkApproval(client, ref(token), storage))!;
        await flush();
        expect(await link.answer(true)).toBe('forbidden');
        expect(storage.getItem(RESUME_STORAGE_KEY)).toBe(token);
        scope.stop();
    });
});
