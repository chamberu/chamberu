/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** How long an approval waits before it is denied, unless approve() names a `timeoutMs`. */
export const DEFAULT_APPROVAL_TIMEOUT_MS = 24 * 60 * 60 * 1000;

/** The longest `timeoutMs` approve() takes (a larger Node timer fires after 1 ms). */
export const APPROVAL_TIMEOUT_MAX_MS = 2 ** 31 - 1;

/** The placeholder a suspended tool call resolves with; it never reaches a checkpoint. */
export const SUSPENDED_RESULT = Object.freeze({ suspended: 'approval' });
