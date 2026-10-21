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
import {
    decodeResumeToken,
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
            replace: true, 
        });
        expect(storage.getItem(RESUME_STORAGE_KEY)).toBe('abc.def');
        expect(readResumeToken(storage)).toBe('abc.def');
    });

    it('is undefined without a query token', () => {
        const storage = new MemoryStorage();
        expect(stripResumeToken({ path: '/approvals', query: { x: '1' } }, storage)).toBeUndefined();
        expect(stripResumeToken({ path: '/approvals', query: { token: '' } }, storage)).toBeUndefined();
        expect(stripResumeToken({ path: '/approvals', query: { token: ['a', 'b'] } }, storage)).toBeUndefined();
        expect(readResumeToken(storage)).toBeUndefined();
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
});
