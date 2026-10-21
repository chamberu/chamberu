/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IPoller, PollerTimers } from './types.ts';

/**
 * Runs `run` now and then `intervalMs` after each run settled, never two
 * at once; a failed run is ignored (the caller keeps its own error state).
 */
export function createPoller(run: () => Promise<void>, intervalMs: number, timers?: PollerTimers): IPoller {
    const set = timers?.set ?? setTimeout;
    const clear = timers?.clear ?? clearTimeout;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inflight: Promise<void> | undefined;
    let active = false;

    const cancelTimer = () => {
        if (timer !== undefined) clear(timer);
        timer = undefined;
    };

    const tick = (): Promise<void> => {
        cancelTimer();
        if (inflight) return inflight;
        inflight = (async () => {
            try {
                await run();
            } catch {
                // the next tick tries again
            } finally {
                inflight = undefined;
                if (active) timer = set(() => { void tick(); }, intervalMs);
            }
        })();
        return inflight;
    };

    return {
        start() {
            if (active) return;
            active = true;
            void tick();
        },
        stop() {
            active = false;
            cancelTimer();
        },
        async refresh() {
            if (inflight) await inflight;
            await tick();
        },
    };
}
