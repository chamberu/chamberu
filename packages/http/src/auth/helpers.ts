/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Invoker } from '@chamberu/core';
import { ForbiddenError, UnauthorizedError } from '@ebec/http';
import type { IAppEvent } from 'routup';
import type { HttpContext } from '../app/types.ts';
import { PRINCIPAL } from './constants.ts';
import { hasPermission } from './module.ts';
import type { Principal } from './types.ts';

/** Claims read as the invoker's display name, first non-empty string wins. */
const NAME_CLAIMS = ['name', 'preferred_username', 'email'] as const;

/**
 * The run invoker (or approver) for a principal: a snapshot of `id`,
 * `kind` and `permissions`, plus a display `name` from the claims (`name`,
 * `preferred_username`, then `email`). Never carries the claims themselves.
 */
export function toInvoker(principal: Principal): Invoker {
    const name = NAME_CLAIMS
        .map((key) => principal.claims?.[key])
        .find((value): value is string => typeof value === 'string' && value.length > 0);
    return {
        id: principal.id,
        kind: principal.kind,
        ...(name !== undefined ? { name } : {}),
        permissions: [...principal.permissions],
    };
}

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
