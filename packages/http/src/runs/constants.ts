/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** Bounds of an `idempotencyKey`, a `thread` and an `Idempotency-Key` header. */
export const KEY_MAX_LENGTH = 256;

/** Longest resume token `POST /resume` reads. */
export const RESUME_TOKEN_MAX_LENGTH = 4_096;

/** Longest approval `reason`. */
export const RESUME_REASON_MAX_LENGTH = 1_000;
