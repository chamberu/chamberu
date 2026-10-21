/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ITokenCache, Issuer, VerifyResult } from 'vouchly';
import type { Principal } from '../types.ts';

/**
 * A vouchly issuer with a required `audience`: without one vouchly skips the
 * `aud` check, and a public issuer's tokens minted for any audience would pass.
 */
export type OidcIssuer = Issuer & { audience: string | string[] };

export type OidcOptions = {
    /** The trusted issuers (vouchly), e.g. GitHub Actions with `audience: 'chamvi'`. */
    issuers: OidcIssuer[];
    /**
     * Maps a verified token to a principal, or `undefined` to refuse it.
     * Required: a public issuer lets anyone mint a matching token, so the
     * deployment decides which claims get which grants.
     */
    principal: (result: VerifyResult) => Principal | undefined | Promise<Principal | undefined>;
    /** Default: vouchly's in-memory cache; `false` disables caching. */
    cache?: ITokenCache | false;
    cacheNamespace?: string;
    fetch?: typeof fetch;
};
