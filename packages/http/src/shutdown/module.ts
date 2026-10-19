/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { systemClock } from '@chamberu/core';
import type { IClock } from '@chamberu/core';
import { DEFAULT_SHUTDOWN_CLOSE_TIMEOUT_MS, DEFAULT_SHUTDOWN_DRAIN_TIMEOUT_MS } from './constants.ts';
import type { IShutdown, ShutdownOptions } from './types.ts';

function delay(clock: IClock, ms: number): { promise: Promise<'timeout'>; clear(): void } {
    let clear = () => {};
    const promise = new Promise<'timeout'>((resolve) => {
        const timer = clock.setTimeout(() => resolve('timeout'), ms, { keepAlive: true });
        clear = () => timer.clear();
    });
    return { promise, clear };
}

/**
 * Graceful shutdown: fail readiness, wait `readinessDelayMs`, stop the
 * scheduler, run the `onShutdown` callbacks, stop intake (`server.close()`),
 * drain the engine, then wait at most `closeTimeoutMs` for open connections
 * before closing them. Failures go to `onError` and never abort the sequence.
 */
export function createShutdown(options: ShutdownOptions): IShutdown {
    const clock = options.clock ?? systemClock;
    // eslint-disable-next-line no-console
    const onError = options.onError ?? ((error: unknown) => console.error('[chamberu]', error));
    const callbacks = new Set<() => void | Promise<void>>();
    let shuttingDown = false;
    let running: Promise<void> | undefined;

    const guard = async (fn: () => unknown): Promise<void> => {
        try {
            await fn();
        } catch (error) {
            onError(error);
        }
    };

    const run = async (): Promise<void> => {
        const readinessDelayMs = options.readinessDelayMs ?? 0;
        if (readinessDelayMs > 0) await delay(clock, readinessDelayMs).promise;

        if (options.scheduler) {
            const { scheduler } = options;
            await guard(() => scheduler.stop());
        }
        for (const callback of [...callbacks]) {
            await guard(callback);
        }

        const { server } = options;
        const closing = server ?
            server.close().then(() => 'closed' as const, (error: unknown) => {
                onError(error);
                return 'closed' as const;
            }) :
            undefined;

        await guard(() => options.engine.drain({ timeoutMs: options.drainTimeoutMs ?? DEFAULT_SHUTDOWN_DRAIN_TIMEOUT_MS }));

        if (server && closing) {
            const timeout = delay(clock, options.closeTimeoutMs ?? DEFAULT_SHUTDOWN_CLOSE_TIMEOUT_MS);
            const outcome = await Promise.race([closing, timeout.promise]);
            timeout.clear();
            // a forced close is expected (keep-alive, open streams), not an error
            if (outcome === 'timeout') await guard(() => server.close(true));
        }
    };

    return {
        get shuttingDown() {
            return shuttingDown;
        },
        onShutdown(fn) {
            callbacks.add(fn);
            return () => {
                callbacks.delete(fn);
            };
        },
        shutdown() {
            if (!running) {
                shuttingDown = true;
                running = run();
            }
            return running;
        },
    };
}
