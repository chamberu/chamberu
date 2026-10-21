/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { LogLevel } from '../config/types.ts';

/** Lower is more severe; an entry is written when its rank is at most the logger's. */
export const LOG_LEVEL_RANK: Readonly<Record<LogLevel, number>> = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
};
