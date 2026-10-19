/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ForbiddenError, UnauthorizedError } from '@ebec/http';
import type { IAppEvent } from 'routup';
import type { HttpContext } from '../app/types.ts';
import { PRINCIPAL } from './constants.ts';
import { hasPermission } from './module.ts';
import type { Principal } from './types.ts';

/**
 * The bearer token of a request: `undefined` without an authorization
 * header, 401 for another scheme or an empty value.
 */
export function readBearerToken(request: Request): string | undefined {
    const header = request.headers.get('authorization');
    if (header === null) return undefined;
    const match = /^bearer +(\S+) *$/i.exec(header);
    if (!match?.[1]) throw new UnauthorizedError({ message: 'The authorization header is malformed.' });
    return match[1];
}

async function resolvePrincipal(event: IAppEvent, ctx: HttpContext): Promise<Principal> {
    let rejection: unknown;
    for (const authenticator of ctx.authenticators) {
        try {
            const principal = await authenticator(event.request);
            if (principal) return principal;
        } catch (error) {
            rejection ??= error;
        }
    }
    throw rejection ?? new UnauthorizedError({ message: 'Authentication required.' });
}

/** Runs the authenticator chain once per request; the first principal wins. */
export function authenticate(event: IAppEvent, ctx: HttpContext): Promise<Principal> {
    let pending = event.store[PRINCIPAL] as Promise<Principal> | undefined;
    if (!pending) {
        pending = resolvePrincipal(event, ctx);
        event.store[PRINCIPAL] = pending;
    }
    return pending;
}

/** `authenticate`, then 403 when `permission` is given and not granted. */
export async function authorize(event: IAppEvent, ctx: HttpContext, permission?: string): Promise<Principal> {
    const principal = await authenticate(event, ctx);
    if (permission !== undefined && !hasPermission(principal, permission)) {
        throw new ForbiddenError({ message: `Missing permission "${permission}".` });
    }
    return principal;
}
