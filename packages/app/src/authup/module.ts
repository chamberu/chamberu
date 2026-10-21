/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createClientTokenCreator } from '@authup/core-http-kit';
import { TokenVerifier } from '@authup/server-adapter-kit';
import type { ITokenVerifier } from '@authup/server-adapter-kit';
import { authup } from '@chamvi/http';
import type { IContainer } from 'eldin';
import type { IModule } from 'orkos';
import { envString, envUrl } from '../env/module.ts';
import { AUTHENTICATOR_ORDER, AppToken } from '../module/constants.ts';
import { AUTHUP_MODULE_NAME } from './constants.ts';
import type { AuthupModuleOptions } from './types.ts';

function createVerifier(options: AuthupModuleOptions): ITokenVerifier {
    const env = options.env ?? process.env;
    const url = options.url ?? envUrl(env, 'AUTHUP_URL', { required: true, protocols: ['http:', 'https:'] });
    const id = options.clientId ?? envString(env, 'AUTHUP_CLIENT_ID', { required: true });
    const secret = options.clientSecret ?? envString(env, 'AUTHUP_CLIENT_SECRET', { required: true });

    return new TokenVerifier({
        baseURL: url,
        creator: createClientTokenCreator({ id, secret }, { client: { baseURL: url } }),
    });
}

/**
 * Contributes the authup authenticator (after static tokens), over
 * `options.verifier` or a remote `TokenVerifier` built from env when the
 * factory is called.
 */
export class AuthupModule implements IModule {
    readonly name: string = AUTHUP_MODULE_NAME;

    readonly verifier: ITokenVerifier;

    constructor(options: AuthupModuleOptions = {}) {
        this.verifier = options.verifier ?? createVerifier(options);
    }

    async setup(container: IContainer): Promise<void> {
        container.registerMany(AppToken.AUTHENTICATORS, {
            useValue: {
                name: 'authup',
                order: AUTHENTICATOR_ORDER.AUTHUP,
                authenticator: authup({ verifier: this.verifier }),
            },
        });
    }
}

/**
 * The authup module. Without `verifier` it reads `AUTHUP_URL`,
 * `AUTHUP_CLIENT_ID` and `AUTHUP_CLIENT_SECRET` (all required) from
 * `options.env ?? process.env` now; options win.
 */
export function authupModule(options?: AuthupModuleOptions): IModule {
    return new AuthupModule(options);
}
