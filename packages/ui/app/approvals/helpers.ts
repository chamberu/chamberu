/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isObject } from 'smob';
import type { LocationQueryRaw } from 'vue-router';
import { RESUME_STORAGE_KEY } from './constants.ts';
import type { ResumeClaims } from './types.ts';

/** `runId` and `approvalId` of a resume token (base64url JSON before the `.`), never verified here. */
export function decodeResumeToken(token: string): ResumeClaims | undefined {
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return undefined;
    try {
        const json = atob(payload.replaceAll('-', '+').replaceAll('_', '/'));
        const value: unknown = JSON.parse(json);
        if (!isObject(value) || typeof value.runId !== 'string' || typeof value.approvalId !== 'string') return undefined;
        return { runId: value.runId, approvalId: value.approvalId };
    } catch {
        return undefined;
    }
}

type Location = { path: string; query: Record<string, unknown> };

type Redirect = {
    path: string; 
    query: LocationQueryRaw; 
    replace: true 
};

/**
 * A global `beforeEach` (registered before the auth guard): a `token`
 * query moves into `sessionStorage` and the navigation is redirected to
 * the same location without it (`replace`), so the address bar, the
 * history and a `login?redirect=` never hold it.
 */
export function stripResumeToken(to: Location, storage: Storage): Redirect | undefined {
    const { token, ...query } = to.query;
    if (typeof token !== 'string' || token.length === 0) return undefined;
    storage.setItem(RESUME_STORAGE_KEY, token);
    return {
        path: to.path, 
        query: query as LocationQueryRaw, 
        replace: true, 
    };
}

export function readResumeToken(storage: Storage): string | undefined {
    return storage.getItem(RESUME_STORAGE_KEY) ?? undefined;
}

export function clearResumeToken(storage: Storage): void {
    storage.removeItem(RESUME_STORAGE_KEY);
}
