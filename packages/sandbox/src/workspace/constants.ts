/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** The workspace root as the model sees it, on every provider. */
export const WORKSPACE_ROOT = '/workspace';

/** Cap per output stream of one exec. */
export const OUTPUT_MAX_BYTES = 65_536;

/** Cap of `readFile` and `writeFile`. */
export const FILE_MAX_BYTES = 1_048_576;

export const EXEC_TIMEOUT_MS = 300_000;

export const EXEC_TIMEOUT_MAX_MS = 1_800_000;

/**
 * The whole environment of a container or pod workspace (plus the configured
 * `env`). `safe.directory` because `/workspace` is a root-owned volume.
 */
export const SANDBOX_ENV: Readonly<Record<string, string>> = Object.freeze({
    HOME: '/tmp',
    GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'safe.directory',
    GIT_CONFIG_VALUE_0: WORKSPACE_ROOT,
    NPM_CONFIG_UPDATE_NOTIFIER: 'false',
    CI: 'true',
});
