/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export type ClockTimerOptions = {
    /**
     * Keep the process alive until the timer fires (default false: engine
     * timers never hold the event loop open). Test clocks ignore it.
     */
    keepAlive?: boolean;
};

export interface IClock {
    now(): Date;
    setTimeout(fn: () => void, ms: number, opts?: ClockTimerOptions): { clear(): void };
}
