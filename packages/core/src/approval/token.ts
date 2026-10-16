import { createHmac, timingSafeEqual } from 'node:crypto';
import { InvalidResumeTokenError } from '../errors.ts';

export interface ResumeTokenClaims {
    runId: string;
    approvalId: string;
    tokenId: string;
}

interface Payload extends ResumeTokenClaims {
    /** expiresAt in epoch milliseconds. */
    exp: number;
}

const sign = (secret: string, encodedPayload: string): Buffer => createHmac('sha256', secret)
    .update(encodedPayload)
    .digest();

/**
 * `base64url(JSON payload) + '.' + base64url(HMAC-SHA256(secret, payload part))`.
 */
export function createResumeToken(
    secret: string,
    p: ResumeTokenClaims & { expiresAt: Date },
): string {
    const payload: Payload = {
        runId: p.runId,
        approvalId: p.approvalId,
        tokenId: p.tokenId,
        exp: p.expiresAt.getTime(),
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${encoded}.${sign(secret, encoded).toString('base64url')}`;
}

function isPayload(value: unknown): value is Payload {
    if (typeof value !== 'object' || value === null) return false;
    const p = value as Record<string, unknown>;
    return typeof p.runId === 'string' &&
        typeof p.approvalId === 'string' &&
        typeof p.tokenId === 'string' &&
        typeof p.exp === 'number' &&
        Number.isFinite(p.exp);
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
    if (!isPayload(payload)) throw new InvalidResumeTokenError('The resume token is malformed.');
    if (now.getTime() >= payload.exp) throw new InvalidResumeTokenError('The resume token has expired.');

    return {
        runId: payload.runId,
        approvalId: payload.approvalId,
        tokenId: payload.tokenId,
    };
}
