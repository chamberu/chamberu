/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Run } from '@chamberu/core';
import { systemClock } from '@chamberu/core';
import { fireCronTrigger } from '../tick/index.ts';
import { SETTLING } from './constants.ts';
import { isQueuedBehindApproval, resolveCronTrigger } from './helpers.ts';
import type { RunJobOptions, RunJobResult } from './types.ts';

/**
 * Fires one cron trigger once (for a Kubernetes CronJob): dispatches the tick
 * at `clock.now()` (the overlap policy applies), then starts the engine and
 * runs one approval tick, so leftovers of earlier jobs (a run whose pod was
 * killed, an interrupted run, an answered or expired approval) are recovered
 * and executed even when the tick is skipped. It waits for the dispatched run
 * to complete, fail, be cancelled, wait for an approval, or stay queued behind
 * a run of its concurrency key that waits for an approval, then drains the
 * engine. Never calls process.exit; set `process.exitCode` from `exitCode`.
 *
 * Caveats: `engine.start()` recovers and executes **every** queued run of
 * **every** agent in the shared store, not only the cron run, and the final
 * `drain()` interrupts whatever is still running after `drainTimeoutMs`, for a
 * long-lived replica (or the next job pod) to resume. Size `drainTimeoutMs` to
 * the job's runs, and prefer a long-lived deployment with createScheduler when
 * runs are long.
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

    let timer: { clear(): void } | undefined;
    let unsubscribe: (() => void) | undefined;
    let settled = false;
    let run: Run | undefined;
    try {
        // recovery, the queue and the approval tick also run when the tick was skipped
        await engine.start();
        await engine.tick();
        if (tick.dispatched) {
            const { runId } = tick;
            run = await new Promise<Run>((resolve, reject) => {
                const done = (candidate: Run) => {
                    settled = true;
                    resolve(candidate);
                };
                // the event only shortens the wait; the poll covers a run executed elsewhere
                unsubscribe = engine.on('run.updated', (e) => {
                    if (e.type === 'run.updated' && e.run.id === runId && SETTLING.includes(e.run.status)) done(e.run);
                });
                const poll = async () => {
                    if (settled) return;
                    const candidate = await engine.getRun(runId);
                    if (settled) return;
                    if (candidate && (SETTLING.includes(candidate.status) || await isQueuedBehindApproval(store, candidate))) {
                        done(candidate);
                        return;
                    }
                    // a poll in flight when the run settled must not re-arm the timer
                    if (!settled) timer = clock.setTimeout(() => poll().catch(reject), pollMs, { keepAlive: true });
                };
                poll().catch(reject);
            });
        }
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

    if (!run) return { status: 'skipped', exitCode: 0 };
    return {
        runId: run.id,
        status: run.status,
        exitCode: run.status === 'failed' || run.status === 'cancelled' ? 1 : 0,
    };
}
