/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** Bound of one send (the comment list and the post), below the engine's notify lock (`claimTtlMs`, 60 s). */
export const GITHUB_NOTIFIER_TIMEOUT_MS = 30_000;

/** `Notification.body` is cut to this many characters (GitHub refuses comments over 65 536). */
export const COMMENT_BODY_MAX_LENGTH = 60_000;

export const DEFAULT_NOTIFIER_NAME = 'github';

/** A GitHub login: letters, digits and single inner dashes, at most 39 characters. */
export const LOGIN_PATTERN = '^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$';

/** The reconcile lists comments updated since the run's `receivedAt` minus this skew. */
export const RECONCILE_SKEW_MS = 3_600_000;

/** An idempotency key used in the marker as is; others are hashed. */
export const SAFE_KEY_PATTERN = '^[\\w:.-]{1,255}$';

/** Backtick runs longer than this are broken up, so the body's fence stays short. */
export const BACKTICK_RUN_MAX_LENGTH = 31;
