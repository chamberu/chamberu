/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** Network of a workspace container unless configured. */
export const DEFAULT_NETWORK = 'bridge';

/** A workspace container is named `chamberu-ws-<workspace id>`. */
export const CONTAINER_NAME_PREFIX = 'chamberu-ws-';

/** uid and gid of every workspace process (the image's `node` user). */
export const SANDBOX_USER = '1000:1000';
