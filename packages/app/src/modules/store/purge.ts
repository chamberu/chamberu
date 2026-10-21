/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isObject } from 'smob';
import type { IPurgeTimer, PurgeTimerOptions } from './types.ts';

/**
 * Runs `store.purgeExpired()` every `intervalMs` on the clock. The next call
 * is armed only after the previous one settled, so calls never overlap.
 */
export function createPurgeTimer(options: PurgeTimerOptions): IPurgeTimer {
    const {
        store,
        clock,
        intervalMs,
        logger,
    } = options;
    let timer: { clear(): void } | undefined;
    let stopped = false;

    const arm = () => {
        if (stopped) {
            return;
        }

        timer = clock.setTimeout(() => {
            timer = undefined;
            store.purgeExpired()
                .then((result) => {
                    logger.debug('Purged expired idempotency keys and locks.', isObject(result) ? result : {});
                })
                .catch((error: unknown) => {
                    logger.error('Purging expired idempotency keys and locks failed.', error);
                })
                .finally(arm);
        }, intervalMs, { keepAlive: false });
    };

    return {
        start() {
            if (stopped || timer) {
                return;
            }

            arm();
        },
        stop() {
            stopped = true;
            timer?.clear();
            timer = undefined;
        },
    };
}
