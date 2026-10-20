/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** Seconds GNU `timeout -k` waits after TERM before it sends KILL. */
export const TIMEOUT_KILL_AFTER_SECONDS = 5;

/**
 * How long past its timeout an exec may take before the workspace stops
 * waiting on the transport and reports exit 137.
 */
export const EXEC_GRACE_MS = 15_000;

/** How much of a command's stderr a file error carries. */
export const ERROR_STDERR_MAX_LENGTH = 2_000;

/**
 * Creates the parent directories of `$1` and writes exactly `$2` bytes
 * of stdin to it: `head -c` stops after them, so no stdin EOF is needed.
 */
export const WRITE_FILE_SCRIPT = 'mkdir -p -- "$(dirname -- "$1")" && head -c "$2" > "$1"';
