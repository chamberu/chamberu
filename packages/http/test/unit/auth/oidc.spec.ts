/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { JWK } from 'jose';
import { staticKeys } from 'vouchly';
import type { Issuer, VerifyResult } from 'vouchly';
import {
    beforeAll,
    describe,
    expect,
    it,
} from 'vitest';
import { InvalidAgentDefinitionError } from '@chamberu/core';
import { oidc } from '@chamberu/http';
import type { OidcOptions, Principal } from '@chamberu/http';
import { createSigningKey, signToken } from '../../utils/jwt.ts';

const ISS = 'https://issuer.test';

const request = (token?: string) => new Request('http://test', { headers: token ? { authorization: `Bearer ${token}` } : {} });

const mapper = (r: VerifyResult): Principal => ({
    id: `ci:${String(r.claims.sub)}`,
    kind: 'oidc',
    permissions: [],
});

describe('oidc', () => {
    let key: Awaited<ReturnType<typeof createSigningKey>>;
    let other: Awaited<ReturnType<typeof createSigningKey>>;
    let issuer: Issuer;

    const claims = (extra: Record<string, unknown> = {}) => ({
        iss: ISS,
        aud: 'chamberu',
        sub: 'repo:acme/x',
        ...extra,
    });

    beforeAll(async () => {
        key = await createSigningKey();
        other = await createSigningKey();
        issuer = {
            id: 'ci',
            issuer: ISS,
            audience: 'chamberu',
            keys: staticKeys([key.jwk as JWK]),
        };
    });

    const make = (principal: OidcOptions['principal'] = mapper, issuers?: Issuer[]) => oidc({
        issuers: issuers ?? [issuer],
        principal,
    });

    it('needs a principal mapper and at least one issuer', () => {
        expect(() => oidc({ issuers: [issuer] } as unknown as OidcOptions)).toThrow(InvalidAgentDefinitionError);
        expect(() => oidc({ issuers: [], principal: mapper })).toThrow(InvalidAgentDefinitionError);
    });

    it('maps a valid token to a principal', async () => {
        const token = await signToken(key.privateKey, claims());
        expect(await make()(request(token))).toEqual({
            id: 'ci:repo:acme/x',
            kind: 'oidc',
            permissions: [],
        });
    });

    it('lets the mapper grant permissions from claims', async () => {
        const auth = make((r) => ({
            id: String(r.claims.sub),
            kind: 'oidc',
            permissions: r.claims.repository === 'acme/x' ? ['agent:deploy:run'] : [],
        }));
        const token = await signToken(key.privateKey, claims({ repository: 'acme/x' }));
        expect((await auth(request(token)))?.permissions).toEqual(['agent:deploy:run']);
    });

    it('rejects an expired token with token_expired', async () => {
        const token = await signToken(key.privateKey, claims(), { expiresIn: Math.floor(Date.now() / 1000) - 600 });
        await expect(make()(request(token))).rejects.toMatchObject({ status: 401, code: 'token_expired' });
    });

    it('rejects a wrong audience with claim_invalid', async () => {
        const token = await signToken(key.privateKey, claims({ aud: 'someone-else' }));
        await expect(make()(request(token))).rejects.toMatchObject({ status: 401, code: 'claim_invalid' });
    });

    it('rejects a token signed by another key with signature_invalid', async () => {
        const token = await signToken(other.privateKey, claims());
        await expect(make()(request(token))).rejects.toMatchObject({ status: 401, code: 'signature_invalid' });
    });

    it('resolves undefined for another issuer or a non-JWT token', async () => {
        const token = await signToken(key.privateKey, claims({ iss: 'https://other.test' }));
        expect(await make()(request(token))).toBeUndefined();
        expect(await make()(request('not-a-jwt'))).toBeUndefined();
        expect(await make()(request())).toBeUndefined();
    });

    it('answers 503 when the keys cannot be loaded', async () => {
        const failing: Issuer = {
            ...issuer,
            keys: async () => {
                throw new TypeError('fetch failed');
            },
        };
        const token = await signToken(key.privateKey, claims());
        await expect(make(mapper, [failing])(request(token))).rejects.toMatchObject({ status: 503 });
    });

    it('answers 401 for a kid the issuer does not publish', async () => {
        const token = await signToken(key.privateKey, claims(), { kid: 'k2' });
        await expect(make()(request(token))).rejects.toMatchObject({ status: 401, code: 'key_unavailable' });
    });

    it('rejects a token the mapper does not allow', async () => {
        const token = await signToken(key.privateKey, claims());
        await expect(make(() => undefined)(request(token))).rejects.toMatchObject({
            status: 401,
            message: 'The token is not allowed.',
        });
    });
});
