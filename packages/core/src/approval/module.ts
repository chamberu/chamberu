/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { timingSafeEqual } from 'node:crypto';
import { InvalidResumeTokenError } from '../errors/index.ts';
import { isResumeTokenPayload, sign } from './helpers.ts';
import type { ResumeTokenClaims, ResumeTokenPayload } from './types.ts';


/**
 * `base64url(JSON payload) + '.' + base64url(HMAC-SHA256(secret, payload part))`.
 */
export function createResumeToken(
    secret: string,
    p: ResumeTokenClaims & { expiresAt: Date },
): string {
    const payload: ResumeTokenPayload = {
        runId: p.runId,
        approvalId: p.approvalId,
        tokenId: p.tokenId,
        exp: p.expiresAt.getTime(),
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${encoded}.${sign(secret, encoded).toString('base64url')}`;
}

/**
 * Verifies signature and expiry (a token expires AT expiresAt) against `now`.
 * Every failure, malformed input included, throws InvalidResumeTokenError.
 */
export function verifyResumeToken(secret: string, token: string, now: Date): ResumeTokenClaims {
    const parts = typeof token === 'string' ? token.split('.') : [];
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
        throw new InvalidResumeTokenError('The resume token is malformed.');
    }
    const [encoded, signature] = parts as [string, string];

    const expected = sign(secret, encoded);
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
        throw new InvalidResumeTokenError('The resume token signature is invalid.');
    }

    let payload: unknown;
    try {
        payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    } catch {
        throw new InvalidResumeTokenError('The resume token is malformed.');
    }
    if (!isResumeTokenPayload(payload)) throw new InvalidResumeTokenError('The resume token is malformed.');
    if (now.getTime() >= payload.exp) throw new InvalidResumeTokenError('The resume token has expired.');

    return {
        runId: payload.runId,
        approvalId: payload.approvalId,
        tokenId: payload.tokenId,
    };
}
