/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { oidc } from '@chamvi/http';
import type { Authenticator, OidcOptions } from '@chamvi/http';
import type { IContainer } from 'eldin';
import type { IModule } from 'orkos';
import { AUTHENTICATOR_ORDER, AppToken } from '../module/constants.ts';
import { OIDC_MODULE_NAME } from './constants.ts';

/** Contributes the `oidc()` authenticator (after authup); validated when the factory is called. No env form. */
export class OidcModule implements IModule {
    readonly name: string = OIDC_MODULE_NAME;

    protected authenticator: Authenticator;

    constructor(options: OidcOptions) {
        this.authenticator = oidc(options);
    }

    async setup(container: IContainer): Promise<void> {
        container.registerMany(AppToken.AUTHENTICATORS, {
            useValue: {
                name: 'oidc',
                order: AUTHENTICATOR_ORDER.OIDC,
                authenticator: this.authenticator,
            },
        });
    }
}

export function oidcModule(options: OidcOptions): IModule {
    return new OidcModule(options);
}
