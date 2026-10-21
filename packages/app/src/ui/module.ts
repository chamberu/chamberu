/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { uiRoutes } from '@chamvi/ui';
import type { UiRoutesOptions } from '@chamvi/ui';
import type { IContainer } from 'eldin';
import type { IModule } from 'orkos';
import { envString, envUrl } from '../env/module.ts';
import type { Env } from '../env/types.ts';
import { AppToken } from '../module/constants.ts';
import { UI_MODULE_NAME } from './constants.ts';
import type { UiModuleOptions } from './types.ts';

/** The token login, plus the authup login with `CHAMVI_UI_AUTHUP_CLIENT_ID` (then `AUTHUP_URL` is required). */
function readAuth(env: Env): NonNullable<UiRoutesOptions['auth']> {
    const clientId = envString(env, 'CHAMVI_UI_AUTHUP_CLIENT_ID');
    if (typeof clientId === 'undefined') {
        return { tokens: true };
    }

    const realmId = envString(env, 'CHAMVI_UI_AUTHUP_REALM_ID');
    return {
        tokens: true,
        authup: {
            url: envUrl(env, 'AUTHUP_URL', { required: true, protocols: ['http:', 'https:'] }),
            clientId,
            ...(typeof realmId === 'string' && { realmId }),
        },
    };
}

/** Contributes the dashboard's `uiRoutes()` to `AppToken.HTTP_ROUTES`. */
export class UiModule implements IModule {
    readonly name: string = UI_MODULE_NAME;

    protected options: UiRoutesOptions;

    constructor(input: UiModuleOptions = {}) {
        const { env, ...options } = input;
        this.options = {
            ...options,
            auth: options.auth ?? readAuth(env ?? process.env),
        };
    }

    async setup(container: IContainer): Promise<void> {
        for (const route of uiRoutes(this.options)) {
            container.registerMany(AppToken.HTTP_ROUTES, { useValue: route });
        }
    }
}

/**
 * The dashboard module (`/ui` under `CHAMVI_BASE_PATH`). Reads
 * `CHAMVI_UI_AUTHUP_CLIENT_ID`, `CHAMVI_UI_AUTHUP_REALM_ID` and `AUTHUP_URL`
 * from `options.env ?? process.env` now, unless `auth` is given.
 */
export function uiModule(options?: UiModuleOptions): IModule {
    return new UiModule(options);
}
