/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Run } from '@chamberu/core';
import { systemClock } from '@chamberu/core';
import { fireCronTrigger } from '../tick/index.ts';
import { SETTLING, resolveCronTrigger } from './helpers.ts';
import type { RunJobOptions, RunJobResult } from './types.ts';

/**
 * Fires one cron trigger once (for a Kubernetes CronJob): dispatches the tick
 * at `clock.now()` (the overlap policy applies), starts the engine, waits for
 * that run to complete, fail, be cancelled or wait for an approval, then drains
 * the engine. Never calls process.exit; set `process.exitCode` from `exitCode`.
 *
 * Caveats: `engine.start()` recovers and executes **every** queued run of
 * **every** agent in the shared store, not only the cron run, and the final
 * `drain()` interrupts whatever is still running after `drainTimeoutMs`, for a
 * long-lived replica (or the next job pod) to resume. runJob waits only for
 * the run it dispatched, so a run left `interrupted` by a killed job pod is
 * finished by a later job pod only if that pod outlives it. Size
 * `drainTimeoutMs` to the job's runs, and prefer a long-lived deployment with
 * createScheduler when runs are long.
 */
export async function runJob(opts: RunJobOptions): Promise<RunJobResult> {
    const {
        engine,
        store,
        agent,
        clock = systemClock,
        pollMs = 1_000,
        drainTimeoutMs = 30_000,
    } = opts;
    const trigger = resolveCronTrigger(agent, opts.trigger);

    const tick = await fireCronTrigger({
        engine,
        store,
        agent,
        trigger,
        scheduledAt: clock.now(),
    });
    if (!tick.dispatched) return { status: 'skipped', exitCode: 0 };
    const { runId } = tick;

    let timer: { clear(): void } | undefined;
    let unsubscribe: (() => void) | undefined;
    let settled = false;
    let run: Run;
    try {
        run = await new Promise<Run>((resolve, reject) => {
            const check = (candidate: Run | undefined) => {
                if (!(candidate && SETTLING.includes(candidate.status))) {
                    return;
                }

                settled = true;
                resolve(candidate);
            };
            // the event only shortens the wait; the poll covers a run executed elsewhere
            unsubscribe = engine.on('run.updated', (e) => {
                if (e.type === 'run.updated' && e.run.id === runId) check(e.run);
            });
            const poll = () => {
                if (settled) return;
                engine.getRun(runId).then((candidate) => {
                    check(candidate);
                    // a poll in flight when the run settled must not re-arm the timer
                    if (!settled) timer = clock.setTimeout(poll, pollMs, { keepAlive: true });
                }, reject);
            };
            engine.start().then(poll, reject);
        });
    } catch (error) {
        // the engine was started: shut it down before reporting
        settled = true;
        await engine.drain({ timeoutMs: drainTimeoutMs }).catch(() => {});
        throw error;
    } finally {
        settled = true;
        timer?.clear();
        unsubscribe?.();
    }
    await engine.drain({ timeoutMs: drainTimeoutMs });

    return {
        runId,
        status: run.status,
        exitCode: run.status === 'failed' || run.status === 'cancelled' ? 1 : 0,
    };
}
