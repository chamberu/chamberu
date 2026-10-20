/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export type RequireToolPermissionOptions = {
    /** What a run without an invoker (cron, webhook) may use. Default `'deny'`. */
    withoutInvoker?: 'allow' | 'deny';
};
