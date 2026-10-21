/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ITokenVerifier } from '@authup/server-adapter-kit';
import type { Env } from '../env/types.ts';

export type AuthupModuleOptions = {
    /** Used as is; no env is read then. */
    verifier?: ITokenVerifier;
    /** Default `AUTHUP_URL`. */
    url?: string;
    /** Default `AUTHUP_CLIENT_ID`. */
    clientId?: string;
    /** Default `AUTHUP_CLIENT_SECRET`. */
    clientSecret?: string;
    /** Default `process.env`, read when the factory is called. */
    env?: Env;
};
