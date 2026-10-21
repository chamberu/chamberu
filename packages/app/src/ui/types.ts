/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { UiRoutesOptions } from '@chamvi/ui';
import type { Env } from '../env/types.ts';

/** `uiRoutes()` options; `auth` defaults to the token login plus authup from env. */
export type UiModuleOptions = UiRoutesOptions & {
    /** Default `process.env`, read when the factory is called. */
    env?: Env;
};
