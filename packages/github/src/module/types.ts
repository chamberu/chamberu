/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Env } from '@chamvi/app';
import type { GithubAppOptions, IGithubApp } from '../app/types.ts';
import type { GithubChannelOptions } from '../channel/types.ts';

/** `githubChannel()` options; `approvalUrl` defaults to the UI link from `CHAMVI_PUBLIC_URL`, `clock` is the app's. */
export type GithubModuleChannelOptions = Omit<GithubChannelOptions, 'app' | 'clock'>;

export type GithubModuleOptions = Partial<GithubAppOptions> & {
    /** Used as is; no env is read then. */
    app?: IGithubApp;
    /** Default `process.env`, read when the factory is called. */
    env?: Env;
    /** The channel's options (name, mentions, approval link, timeout, body limit). */
    channel?: GithubModuleChannelOptions;
};
