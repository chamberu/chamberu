/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export const DEFAULT_HISTORY = 20;

export const HISTORY_MAX = 100;

export const HISTORY_TEXT_MAX_LENGTH = 4_000;

export const APPROVE_ACTION_ID = 'chamvi:approve';

export const DENY_ACTION_ID = 'chamvi:deny';

/** Prefix of the bridge's keys in the Chat SDK state adapter. */
export const STATE_KEY_PREFIX = 'chamvi';

/** How long a sent notification or reply is remembered (the 7-day idempotency window of the engine). */
export const STATE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
