/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** The lifecycle hook that starts and stops the agents dir's watcher. */
export const AGENTS_WATCHER_HOOK_NAME = 'chamvi:agents-watcher';

export const NO_AGENTS_MESSAGE = 'createApp needs at least one agent or CHAMVI_AGENTS_DIR.';

export const NO_DIRECTORY_MESSAGE = 'CHAMVI_AGENTS_DIR must name a directory.';

/** How often the boot loads a folder that changes while it is read before it leaves it to the watcher. */
export const BOOT_LOAD_ATTEMPTS = 3;

/** Logged once when the agents dir has no entry at all (an unmounted volume's mount point). */
export const EMPTY_ROOT_MESSAGE = 'the agents dir is empty; no agent is removed';
