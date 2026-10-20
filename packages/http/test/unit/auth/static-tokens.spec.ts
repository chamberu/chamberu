/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { InvalidAgentDefinitionError } from '@chamberu/core';
import { staticTokens } from '@chamberu/http';

const TOKEN = 'ci-token-0123456789';

const request = (authorization?: string) => new Request('http://test', { headers: authorization ? { authorization } : {} });

describe('staticTokens', () => {
    const auth = staticTokens({ tokens: { [TOKEN]: { id: 'ci', permissions: ['run:read'] } } });

    it('resolves the principal of a known token', async () => {
        expect(await auth(request(`Bearer ${TOKEN}`))).toEqual({
            id: 'ci',
            kind: 'token',
            permissions: ['run:read'],
        });
    });

    it('resolves undefined without a header or for an unknown token', async () => {
        expect(await auth(request())).toBeUndefined();
        expect(await auth(request('Bearer unknown-token-0123456789'))).toBeUndefined();
    });

    it('rejects another scheme with 401', async () => {
        await expect(auth(request('Basic abc'))).rejects.toMatchObject({ status: 401 });
    });

    it('rejects short tokens and an empty map', () => {
        expect(() => staticTokens({ tokens: { short: { id: 'x', permissions: [] } } })).toThrow(InvalidAgentDefinitionError);
        expect(() => staticTokens({ tokens: {} })).toThrow(InvalidAgentDefinitionError);
    });

    it('rejects a token without an id', () => {
        expect(() => staticTokens({ tokens: { [TOKEN]: { id: '', permissions: [] } } })).toThrow(InvalidAgentDefinitionError);
    });
});
