/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/**
 * The largest delay a Node timer takes (2^31 - 1 ms, about 24.8 days); a
 * larger one fires after 1 ms, so every `*_MS` variable is capped at it.
 */
export const TIMER_MAX_MS = 2_147_483_647;
