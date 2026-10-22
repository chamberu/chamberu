/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { ErrorCode, ValidationError, readRequestBody } from '@chamvi/core';

const encoder = new TextEncoder();

/** A request whose body arrives in the given chunks, without a content-length. */
function chunked(chunks: string[], onPull?: () => void): Request {
    let i = 0;
    const body = new ReadableStream<Uint8Array>({
        pull(controller) {
            onPull?.();
            if (i < chunks.length) controller.enqueue(encoder.encode(chunks[i++]));
            else controller.close();
        },
    }, { highWaterMark: 0 });
    return new Request('http://localhost/x', {
        method: 'POST',
        body,
        duplex: 'half',
    } as RequestInit);
}

describe('readRequestBody', () => {
    it('returns the bytes', async () => {
        const request = new Request('http://localhost/x', { method: 'POST', body: '{"a":1}' });
        const bytes = await readRequestBody(request, { limit: 100 });
        expect(bytes).toBeInstanceOf(Uint8Array);
        expect(new TextDecoder().decode(bytes)).toBe('{"a":1}');
    });

    it('returns the bytes of a chunked body within the limit', async () => {
        const bytes = await readRequestBody(chunked(['ab', 'cd']), { limit: 4 });
        expect(new TextDecoder().decode(bytes)).toBe('abcd');
    });

    it('returns an empty array for a request without a body', async () => {
        const bytes = await readRequestBody(new Request('http://localhost/x'), { limit: 4 });
        expect(bytes).toEqual(new Uint8Array());
    });

    it('refuses a content-length above the limit unread', async () => {
        let pulled = 0;
        const request = chunked(['abcdef'], () => { pulled++; });
        const headers = new Headers({ 'content-length': '6' });
        const limited = new Proxy(request, {
            get(target, key) {
                if (key === 'headers') return headers;
                const value = Reflect.get(target, key, target);
                return typeof value === 'function' ? value.bind(target) : value;
            },
        });
        const error = await readRequestBody(limited, { limit: 5 }).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).code).toBe(ErrorCode.PAYLOAD_TOO_LARGE);
        expect(ErrorCode.PAYLOAD_TOO_LARGE).toBe('payload_too_large');
        expect(pulled).toBe(0);
        expect(request.bodyUsed).toBe(false);
    });

    it('refuses a chunked body once it passes the limit', async () => {
        let pulled = 0;
        const request = chunked(['abc', 'def', 'ghi', 'jkl'], () => { pulled++; });
        const error = await readRequestBody(request, { limit: 5 }).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).code).toBe('payload_too_large');
        // stopped at the chunk that passed the limit, the rest is never read
        expect(pulled).toBeLessThan(4);
    });
});
