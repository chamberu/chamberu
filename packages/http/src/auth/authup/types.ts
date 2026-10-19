/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ITokenVerifier } from '@authup/server-adapter-kit';

export type AuthupOptions = {
    /** An authup `TokenVerifier` (remote mode for grants) or any `ITokenVerifier`. */
    verifier: ITokenVerifier;
    /** RFC 8705: the client certificate's SHA-256 thumbprint, for certificate-bound tokens. */
    certificateThumbprintByRequest?: (request: Request) => string | undefined | Promise<string | undefined>;
};
