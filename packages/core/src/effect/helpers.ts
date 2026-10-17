/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createHash } from 'node:crypto';
import { isObject } from 'smob';

function canonical(value: unknown): unknown {
    if (isObject(value) && typeof value.toJSON === 'function') {
        return canonical(value.toJSON());
    }
    if (Array.isArray(value)) return value.map((v) => canonical(v));
    if (isObject(value)) {
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(value).sort()) {
            out[key] = canonical(value[key]);
        }
        return out;
    }
    return value;
}

/**
 * sha256 hex of the canonical JSON (recursively sorted keys; undefined dropped;
 * toJSON values such as Date are serialized via toJSON). BigInt and cyclic
 * inputs are unsupported and throw.
 */
export function stableHash(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(canonical(value)) ?? 'undefined').digest('hex');
}
