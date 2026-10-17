/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createHmac } from 'node:crypto';
import { isObject } from 'smob';
import type { ResumeTokenPayload } from './types.ts';

export function sign(secret: string, encodedPayload: string): Buffer {
    return createHmac('sha256', secret)
        .update(encodedPayload)
        .digest();
}

export function isResumeTokenPayload(value: unknown): value is ResumeTokenPayload {
    if (!isObject(value)) return false;
    return typeof value.runId === 'string' &&
        typeof value.approvalId === 'string' &&
        typeof value.tokenId === 'string' &&
        typeof value.exp === 'number' &&
        Number.isFinite(value.exp);
}
