/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import { createResumeToken } from '../../../../../core/src/approval/module.ts';
import { RESUME_STORAGE_KEY } from '../../../../app/approvals/constants.ts';
import type { RunWire } from '../../../../app/api/types.ts';
import {
    decodeResumeToken,
    pendingApprovals,
    readResumeToken,
    stripResumeToken,
} from '../../../../app/approvals/helpers.ts';
import { createAuthGuard } from '../../../../app/auth/guard.ts';
import { createSession } from '../../../../app/auth/module.ts';
import { DEV_CONFIG } from '../../../../app/config/constants.ts';
import { RouteName } from '../../../../app/router/constants.ts';
import { createUiRouter } from '../../../../app/router/module.ts';
import { fakeClient, meFor } from '../../../utils/client.ts';
import { MemoryStorage } from '../../../utils/storage.ts';

describe('decodeResumeToken', () => {
    it('reads runId and approvalId', () => {
        const token = createResumeToken('secret', {
            runId: 'run-1',
            approvalId: 'appr-1',
            tokenId: 'tok-1',
            expiresAt: new Date(2_000_000),
        });
        expect(decodeResumeToken(token)).toEqual({ runId: 'run-1', approvalId: 'appr-1' });
    });

    it('is undefined for garbage', () => {
        for (const token of ['', 'abc', 'abc.def', `${btoa('[]')}.x`, `${btoa('{"runId":1}')}.x`, '!!!.x']) {
            expect(decodeResumeToken(token), token).toBeUndefined();
        }
    });
});

describe('stripResumeToken', () => {
    it('keeps the token and redirects without it', () => {
        const storage = new MemoryStorage();
        const redirect = stripResumeToken({ path: '/approvals', query: { token: 'abc.def', x: '1' } }, storage);
        expect(redirect).toEqual({
            path: '/approvals',
            query: { x: '1' },
            hash: '',
            replace: true,
        });
        expect(storage.getItem(RESUME_STORAGE_KEY)).toBe('abc.def');
        expect(readResumeToken(storage)).toBe('abc.def');
    });

    it('is undefined without a token key', () => {
        const storage = new MemoryStorage();
        expect(stripResumeToken({ path: '/approvals', query: { x: '1' } }, storage)).toBeUndefined();
        expect(stripResumeToken({
            path: '/approvals', 
            query: {}, 
            hash: '#section', 
        }, storage)).toBeUndefined();
        expect(readResumeToken(storage)).toBeUndefined();
    });

    it('strips an empty token without keeping it', () => {
        const storage = new MemoryStorage();
        expect(stripResumeToken({ path: '/approvals', query: { token: '' } }, storage)?.query).toEqual({});
        expect(stripResumeToken({ path: '/approvals', query: { token: null } }, storage)?.query).toEqual({});
        expect(readResumeToken(storage)).toBeUndefined();
    });

    it('keeps the first token of a repeated query key and strips them all', () => {
        const storage = new MemoryStorage();
        const redirect = stripResumeToken({ path: '/approvals', query: { token: ['', 'a.b', 'c.d'], x: '1' } }, storage);
        expect(redirect?.query).toEqual({ x: '1' });
        expect(readResumeToken(storage)).toBe('a.b');
    });

    it('takes the token from the fragment, keeping the other fragment entries', () => {
        const storage = new MemoryStorage();
        expect(stripResumeToken({
            path: '/approvals', 
            query: {}, 
            hash: '#token=a.b', 
        }, storage)).toEqual({
            path: '/approvals',
            query: {},
            hash: '',
            replace: true,
        });
        expect(readResumeToken(storage)).toBe('a.b');
        expect(stripResumeToken({
            path: '/approvals', 
            query: {}, 
            hash: '#token=e.f&tab=2', 
        }, storage)?.hash).toBe('#tab=2');
        expect(readResumeToken(storage)).toBe('e.f');
        // a query token wins, both leave the location
        const both = stripResumeToken({
            path: '/approvals', 
            query: { token: 'q.q' }, 
            hash: '#token=h.h', 
        }, storage);
        expect(both?.hash).toBe('');
        expect(readResumeToken(storage)).toBe('q.q');
    });

    it('the login redirect never carries the token', async () => {
        const storage = new MemoryStorage();
        const session = createSession(DEV_CONFIG, { storage, client: () => fakeClient({ me: meFor('good') }) });
        const router = createUiRouter(
            DEV_CONFIG,
            [(to) => stripResumeToken(to, storage) ?? true, createAuthGuard(session)],
            createMemoryHistory('/ui'),
        );
        await router.push('/approvals?token=abc&x=1');
        expect(router.currentRoute.value.name).toBe(RouteName.LOGIN);
        expect(router.currentRoute.value.query.redirect).toBe('/approvals?x=1');
        expect(router.currentRoute.value.fullPath).not.toContain('abc');
        expect(readResumeToken(storage)).toBe('abc');
    });

    it('the login redirect never carries a repeated or fragment token', async () => {
        for (const link of ['/approvals?token=abc&token=abc&x=1', '/approvals?x=1#token=abc']) {
            const storage = new MemoryStorage();
            const session = createSession(DEV_CONFIG, { storage, client: () => fakeClient({ me: meFor('good') }) });
            const router = createUiRouter(
                DEV_CONFIG,
                [(to) => stripResumeToken(to, storage) ?? true, createAuthGuard(session)],
                createMemoryHistory('/ui'),
            );
            await router.push(link);
            expect(router.currentRoute.value.name, link).toBe(RouteName.LOGIN);
            expect(router.currentRoute.value.query.redirect, link).toBe('/approvals?x=1');
            expect(router.currentRoute.value.fullPath, link).not.toContain('abc');
            expect(readResumeToken(storage), link).toBe('abc');
        }
    });
});

describe('pendingApprovals', () => {
    const waitingOn = (id: string, approvalId: string) => ({
        id,
        agent: 'deploy',
        status: 'waiting',
        waiting: { approvalId, toolName: 'deploy' },
    }) as unknown as RunWire;

    it('hides a run whose current approval was answered here', () => {
        const run = waitingOn('r1', 'a1');
        const other = waitingOn('r2', 'a1');
        expect(pendingApprovals([run, other], [{
            run, 
            result: 'answered', 
            approved: true, 
        }])).toEqual([other]);
    });

    it('shows the run again once it waits on its next approval', () => {
        const answered = waitingOn('r1', 'a1');
        const next = waitingOn('r1', 'a2');
        expect(pendingApprovals([next], [{
            run: answered, 
            result: 'answered', 
            approved: true, 
        }])).toEqual([next]);
    });

    it('keeps a run whose answer did not land and drops the deep link run', () => {
        const run = waitingOn('r1', 'a1');
        const linked = waitingOn('r3', 'a9');
        expect(pendingApprovals([run, linked], [{
            run, 
            result: 'forbidden', 
            approved: true, 
        }], 'r3')).toEqual([run]);
    });
});
