/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Env } from '@chamvi/app';
import type { UiRoutesOptions } from '../routes/types.ts';

/** `uiRoutes()` options; `auth` defaults to the token login plus authup from env. */
export type UiModuleOptions = UiRoutesOptions & {
    /** Default `process.env`, read when the factory is called. */
    env?: Env;
};
