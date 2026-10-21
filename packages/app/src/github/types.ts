/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { GithubAppOptions, IGithubApp } from '@chamvi/github';
import type { GithubNotifierOptions } from '@chamvi/notify-github';
import type { Env } from '../env/types.ts';

export type GithubModuleOptions = Partial<GithubAppOptions> & {
    /** Used as is; no env is read then. */
    app?: IGithubApp;
    /** Default `process.env`, read when the factory is called. */
    env?: Env;
    /** Default `/webhooks/github`. */
    webhookPath?: string;
};

/** `githubNotifier()` options; `approvalUrl` defaults to the UI link from `CHAMVI_PUBLIC_URL`, `clock` is the app's. */
export type GithubNotifierModuleOptions = Omit<GithubNotifierOptions, 'clock'>;
