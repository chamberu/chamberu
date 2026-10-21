/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ChamviError } from '@chamvi/core';
import { describe, expect, it } from 'vitest';
import { maskPassword } from '../../../../src/modules/store/helpers.ts';

const URL_WITH_PASSWORD = 'postgres://u:p%40ss-w0rd@db:5432/x';

describe('maskPassword', () => {
    it('keeps an error that holds no password', () => {
        const error = new Error('connect ECONNREFUSED 127.0.0.1:1');
        expect(maskPassword(error, URL_WITH_PASSWORD)).toBe(error);
    });

    it('keeps the error for a URL without a password', () => {
        const error = new Error('postgres://u@db/x refused');
        expect(maskPassword(error, 'postgres://u@db/x')).toBe(error);
    });

    it('masks the decoded password in the message', () => {
        const masked = maskPassword(new Error('auth failed for p@ss-w0rd'), URL_WITH_PASSWORD);
        expect(masked).toBeInstanceOf(ChamviError);
        expect((masked as ChamviError).code).toBe('store_error');
        expect((masked as ChamviError).message).toBe('auth failed for ***');
    });

    it('masks the encoded password and drops a cause that holds it', () => {
        const error = new Error('bad url postgres://u:p%40ss-w0rd@db:5432/x', { cause: new Error('p@ss-w0rd') });
        const masked = maskPassword(error, URL_WITH_PASSWORD) as ChamviError;
        expect(masked.message).toBe('bad url postgres://u:***@db:5432/x');
        expect(masked.cause).toBeUndefined();
    });

    it('a password found only in a field still replaces the error', () => {
        const error = Object.assign(new Error('failed'), { url: URL_WITH_PASSWORD });
        const masked = maskPassword(error, URL_WITH_PASSWORD) as ChamviError;
        expect(masked).toBeInstanceOf(ChamviError);
        expect(masked.message).toBe('failed');
    });

    it('a URL that does not parse keeps the error', () => {
        const error = new Error('x');
        expect(maskPassword(error, 'not a url')).toBe(error);
    });
});
