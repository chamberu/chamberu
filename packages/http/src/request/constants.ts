/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/**
 * Bounds of an `idempotencyKey`, a `thread`, an `Idempotency-Key` header and
 * a webhook's derived keys: the width of `@chamberu/store-typeorm`'s
 * `runs.thread` and `runs.concurrency_key` columns.
 */
export const KEY_MAX_LENGTH = 255;
