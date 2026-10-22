/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { GithubNotifierOptions } from '../notifier/types.ts';

/** `githubNotifier()` options; `approvalUrl` defaults to the UI link from `CHAMVI_PUBLIC_URL`, `clock` is the app's. */
export type GithubNotifierModuleOptions = Omit<GithubNotifierOptions, 'clock'>;
