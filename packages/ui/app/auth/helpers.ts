/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { STORAGE_PREFIX } from './constants.ts';

/** `path` when it is a path of this app (`/...`, never `//host` or a URL), else `fallback`. */
export function safeReturnPath(path: unknown, fallback = '/'): string {
    if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return fallback;
    return path;
}

/** Removes every `chamvi.` key: the token, the return path, a pending deep-link token. */
export function clearStorage(storage: Storage): void {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key?.startsWith(STORAGE_PREFIX)) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
}

/**
 * Core's permission rule in the browser: `*` alone grants everything, a
 * `*` segment matches one segment, segment counts must match.
 */
export function hasPermission(granted: readonly string[], wanted: string): boolean {
    const want = wanted.split(':');
    return granted.some((grant) => {
        if (grant === '*') return true;
        const have = grant.split(':');
        return have.length === want.length && have.every((segment, i) => segment === '*' || segment === want[i]);
    });
}
