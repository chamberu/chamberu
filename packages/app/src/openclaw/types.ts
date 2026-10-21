/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { OpenclawNotifierOptions } from '@chamvi/notify-openclaw';
import type { Env } from '../env/types.ts';

/**
 * `openclaw()` options; the ones not given come from env, `approvalUrl`
 * defaults to the UI link from `CHAMVI_PUBLIC_URL`, `clock` to the app's.
 */
export type OpenclawModuleOptions = Partial<OpenclawNotifierOptions> & {
    /** Default `process.env`, read when the factory is called. */
    env?: Env;
};
