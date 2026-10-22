/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Env } from '@chamvi/app';
import type { GithubAppOptions, IGithubApp } from '../app/types.ts';

export type GithubModuleOptions = Partial<GithubAppOptions> & {
    /** Used as is; no env is read then. */
    app?: IGithubApp;
    /** Default `process.env`, read when the factory is called. */
    env?: Env;
    /** Default `/webhooks/github`. */
    webhookPath?: string;
};
