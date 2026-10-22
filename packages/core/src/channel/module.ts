/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ErrorCode, ValidationError } from '../errors/index.ts';
import type { ReadRequestBodyOptions } from './types.ts';

const tooLarge = (limit: number) => new ValidationError(
    `The request body is larger than ${limit} bytes.`,
    [],
    ErrorCode.PAYLOAD_TOO_LARGE,
);

/**
 * Reads a request body of at most `limit` bytes: a `content-length` above
 * it is refused unread, a body without one is read until it passes the
 * limit. Refusals are a ValidationError with code `payload_too_large`
 * (an http app answers 413). Media-type checks stay with the caller.
 */
export async function readRequestBody(request: Request, options: ReadRequestBodyOptions): Promise<Uint8Array> {
    const { limit } = options;
    const length = request.headers.get('content-length');
    if (length !== null && /^\d+$/.test(length) && Number(length) > limit) throw tooLarge(limit);
    if (!request.body) return new Uint8Array();

    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > limit) throw tooLarge(limit);
            chunks.push(value);
        }
    } catch (error) {
        await reader.cancel().catch(() => {});
        throw error;
    } finally {
        reader.releaseLock();
    }

    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}
