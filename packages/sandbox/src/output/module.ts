/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { completeLength } from './helpers.ts';
import type { IOutputCollector } from './types.ts';

export function createOutputCollector(maxBytes: number): IOutputCollector {
    const chunks: Uint8Array[] = [];
    let size = 0;
    let truncated = false;
    const decoder = new TextDecoder();

    const bytes = (): Uint8Array => {
        const out = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
            out.set(chunk, offset);
            offset += chunk.length;
        }
        return out;
    };

    return {
        write(chunk) {
            const room = maxBytes - size;
            if (chunk.length > room) truncated = true;
            const kept = Math.min(room, chunk.length);
            if (kept <= 0) return;
            chunks.push(chunk.slice(0, kept));
            size += kept;
        },
        get truncated() {
            return truncated;
        },
        bytes,
        text() {
            const all = bytes();
            return decoder.decode(truncated ? all.subarray(0, completeLength(all)) : all);
        },
    };
}
