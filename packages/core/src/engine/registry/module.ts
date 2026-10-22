/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidRunStateError, RunNotFoundError } from '../../errors/index.ts';
import { RunStatus } from '../../run/constants.ts';
import { withAgentLock } from './helpers.ts';
import type { RegistryContext } from './types.ts';

const UNSETTLED = [RunStatus.QUEUED, RunStatus.RUNNING, RunStatus.WAITING, RunStatus.INTERRUPTED];

/**
 * Cancels the agent's unsettled runs (created before `before`, when given),
 * concurrently. A run that settled or vanished meanwhile is skipped; any
 * other failure goes to onError and the other runs are still cancelled.
 */
export async function cancelAgentRuns(ctx: RegistryContext, agent: string, before?: Date): Promise<void> {
    const { data } = await ctx.store.listRuns({ agent, status: UNSETTLED });
    const runs = before === undefined ?
        data :
        data.filter((run) => run.createdAt.getTime() < before.getTime());
    const results = await Promise.allSettled(runs.map((run) => ctx.cancel(run.id)));
    results.forEach((result, i) => {
        if (result.status === 'fulfilled') return;
        if (result.reason instanceof RunNotFoundError || result.reason instanceof InvalidRunStateError) return;
        ctx.onError(result.reason, runs[i]);
    });
}

/**
 * Brings the stored revision marker of `agent` to `revision`, under the
 * registry lock: when it differs, the runs created before the change are
 * cancelled (only when a marker existed: a first sight cancels nothing) and
 * the marker is written. A marker already at `revision` is left alone, so
 * every change cancels once across replicas.
 */
export async function syncRevision(ctx: RegistryContext, agent: string, revision: string): Promise<void> {
    await withAgentLock(ctx, agent, async () => {
        const marker = await ctx.store.getAgentRevision(agent);
        if (marker?.hash === revision) return;
        const changedAt = ctx.clock.now();
        if (marker) await cancelAgentRuns(ctx, agent, changedAt);
        await ctx.store.setAgentRevision({
            agent, 
            hash: revision, 
            changedAt, 
        });
    });
}

/**
 * Removes the agent from the store's view, under the registry lock: with a
 * marker, all its unsettled runs are cancelled and the marker deleted;
 * without one, its runs are cancelled only when `local` (a code agent
 * registered on this engine).
 */
export async function dropRevision(ctx: RegistryContext, agent: string, local: boolean): Promise<void> {
    await withAgentLock(ctx, agent, async () => {
        const marker = await ctx.store.getAgentRevision(agent);
        if (marker) {
            await cancelAgentRuns(ctx, agent);
            await ctx.store.deleteAgentRevision(agent);
        } else if (local) {
            await cancelAgentRuns(ctx, agent);
        }
    });
}
