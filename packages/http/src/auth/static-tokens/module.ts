/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError } from '@chamberu/core';
import { readBearerToken } from '../helpers.ts';
import type { Authenticator, Principal } from '../types.ts';
import { STATIC_TOKEN_MIN_LENGTH } from './constants.ts';
import { hashToken } from './helpers.ts';
import type { StaticTokensOptions } from './types.ts';

/**
 * Bearer tokens configured up front (CI, OpenClaw). Tokens are looked up by
 * their SHA-256, never compared as strings. An unknown token resolves
 * `undefined`, so the chain continues.
 */
export function staticTokens(options: StaticTokensOptions): Authenticator {
    const entries = Object.entries(options.tokens ?? {});
    if (entries.length === 0) {
        throw new InvalidAgentDefinitionError('staticTokens() needs at least one token.');
    }

    const principals = new Map<string, Principal>();
    for (const [token, { id, permissions }] of entries) {
        if (token.length < STATIC_TOKEN_MIN_LENGTH) {
            throw new InvalidAgentDefinitionError(
                `The static token of "${id}" must have at least ${STATIC_TOKEN_MIN_LENGTH} characters.`,
            );
        }
        principals.set(hashToken(token), {
            id,
            kind: 'token',
            permissions: [...permissions],
        });
    }

    return async (request) => {
        const token = readBearerToken(request);
        if (token === undefined) return undefined;
        const principal = principals.get(hashToken(token));
        return principal ? { ...principal, permissions: [...principal.permissions] } : undefined;
    };
}
