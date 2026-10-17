/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { InvalidResumeTokenError, createResumeToken, verifyResumeToken } from '@chamberu/core';

const payload = {
    runId: 'run-1',
    approvalId: 'appr-1',
    tokenId: 'tok-1',
    expiresAt: new Date(10_000),
};

/** A correctly signed token around an arbitrary payload. */
const signed = (raw: string) => {
    const encoded = Buffer.from(raw).toString('base64url');
    return `${encoded}.${createHmac('sha256', 'secret').update(encoded).digest('base64url')}`;
};

describe('resume token', () => {
    it('token roundtrip', () => {
        const token = createResumeToken('secret', payload);
        expect(token).toMatch(/^[\w-]+\.[\w-]+$/);
        expect(verifyResumeToken('secret', token, new Date(9_999))).toEqual({
            runId: 'run-1',
            approvalId: 'appr-1',
            tokenId: 'tok-1',
        });
    });

    it('rejects a token signed with another secret', () => {
        const token = createResumeToken('other', payload);
        expect(() => verifyResumeToken('secret', token, new Date(0))).toThrow(InvalidResumeTokenError);
    });

    it('rejects a tampered payload', () => {
        const token = createResumeToken('secret', payload);
        const [, signature] = token.split('.');
        const forged = Buffer.from(JSON.stringify({ ...payload, runId: 'run-2' })).toString('base64url');
        expect(() => verifyResumeToken('secret', `${forged}.${signature}`, new Date(0))).toThrow(InvalidResumeTokenError);
    });

    it('rejects a token at or past expiresAt', () => {
        const token = createResumeToken('secret', payload);
        expect(() => verifyResumeToken('secret', token, new Date(10_000))).toThrow(InvalidResumeTokenError);
    });

    it.each([
        '',
        'abc',
        'a.b.c',
        '.',
        `${Buffer.from('not json').toString('base64url')}.x`,
        signed('not json'),
        signed('{"runId":1}'),
        signed('null'),
    ])('malformed token %j throws InvalidResumeTokenError', (token) => {
        expect(() => verifyResumeToken('secret', token, new Date(0))).toThrow(InvalidResumeTokenError);
    });

    it('rejects a correctly signed payload of the wrong shape', () => {
        // signature is valid, but the payload is not a token payload
        const bad = createResumeToken('secret', { ...payload, expiresAt: new Date(NaN) });
        expect(() => verifyResumeToken('secret', bad, new Date(0))).toThrow(InvalidResumeTokenError);
    });
});
