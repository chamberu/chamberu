/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** How long `shutdown()` lets in-flight runs finish before interrupting them. */
export const DEFAULT_SHUTDOWN_DRAIN_TIMEOUT_MS = 30_000;

/** How long `shutdown()` waits for open connections before closing them. */
export const DEFAULT_SHUTDOWN_CLOSE_TIMEOUT_MS = 5_000;
