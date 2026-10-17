/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { LanguageModel } from 'ai';
import { tool } from 'ai';
import {
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import { z } from 'zod';
import type { AgentDefinition, TriggerDefinition } from '@chamberu/core';
import {
    InvalidAgentDefinitionError,
    MemoryStore,
    RunEngine,
    cron,
    defineAgent,
    manual,
} from '@chamberu/core';
import { fireCronTrigger, runJob } from '@chamberu/scheduler';
import { ControllableClock } from '@chamberu/test-kit';
import { approvalModel, failingModel, textModel } from '../../utils/model.ts';

const T = new Date('2026-03-01T08:00:00.000Z');

function setup(
    model: LanguageModel,
    triggers: TriggerDefinition[] = [cron('*/5 * * * *')],
    extra: Partial<AgentDefinition> = {},
) {
    const clock = new ControllableClock(T);
    const store = new MemoryStore({ clock });
    const agent = defineAgent({
        name: 'sweep',
        model,
        instructions: 'x',
        triggers,
        ...extra,
    });
    const engine = new RunEngine({
        store,
        agents: [agent],
        resumeSecret: 's',
        clock,
    });
    return {
        clock,
        store,
        agent,
        engine,
    };
}

describe('runJob', () => {
    it('returns 0 for a completed run', async () => {
        const {
            clock,
            store,
            agent,
            engine,
        } = setup(textModel());

        const result = await runJob({
            engine,
            store,
            agent,
            clock,
        });

        expect(result).toMatchObject({ status: 'completed', exitCode: 0 });
        const run = await store.getRun(result.runId as string);
        expect(run?.trigger.idempotencyKey).toMatch(/@2026-03-01T08:00:00\.000Z$/);
    });

    it('returns 1 for a failed run', async () => {
        const {
            clock,
            store,
            agent,
            engine,
        } = setup(failingModel());

        const result = await runJob({
            engine,
            store,
            agent,
            clock,
        });

        expect(result).toMatchObject({ status: 'failed', exitCode: 1 });
    });

    it('returns when the run waits for an approval', async () => {
        const {
            clock,
            store,
            agent,
            engine,
        } = setup(approvalModel('deploy'), undefined, {
            tools: () => ({ deploy: tool({ inputSchema: z.object({}), execute: async () => 'deployed' }) }),
            approvals: { deploy: 'user' },
        });

        const result = await runJob({
            engine,
            store,
            agent,
            clock,
        });

        expect(result).toMatchObject({ status: 'waiting', exitCode: 0 });
        expect((await store.getRun(result.runId as string))?.status).toBe('waiting');
    });

    it('skips under the overlap policy, still running the engine once', async () => {
        const {
            clock,
            store,
            agent,
            engine,
        } = setup(textModel());
        const trigger = agent.definition.triggers?.[0] as TriggerDefinition;
        await fireCronTrigger({
            engine,
            store,
            agent,
            trigger,
            scheduledAt: new Date(T.getTime() - 300_000),
        });
        const start = vi.spyOn(engine, 'start');
        const drain = vi.spyOn(engine, 'drain');

        const result = await runJob({
            engine,
            store,
            agent,
            clock,
        });

        expect(result).toEqual({ status: 'skipped', exitCode: 0 });
        expect(result.runId).toBeUndefined();
        expect(start).toHaveBeenCalledTimes(1);
        expect(drain).toHaveBeenCalledWith({ timeoutMs: 30_000 });
    });

    it('recovers a run left running by a killed job pod when it skips', async () => {
        const {
            clock,
            store,
            agent,
            engine,
        } = setup(textModel());
        const trigger = agent.definition.triggers?.[0] as TriggerDefinition;
        const tick = await fireCronTrigger({
            engine,
            store,
            agent,
            trigger,
            scheduledAt: T,
        });
        const { runId } = tick as { runId: string };
        expect(await store.claimRun(runId, 'pod-1', 60_000)).toBe(true);
        await store.updateRun(runId, { status: 'running' });
        clock.advance(15 * 60_000);

        const pod2 = new RunEngine({
            store,
            agents: [agent],
            resumeSecret: 's',
            clock,
            owner: 'pod-2',
        });
        const result = await runJob({
            engine: pod2,
            store,
            agent,
            clock,
        });

        expect(result).toEqual({ status: 'skipped', exitCode: 0 });
        expect((await store.getRun(runId))?.status).toBe('completed');
    });

    it('times out an expired approval left by an earlier job when it skips', async () => {
        const {
            clock,
            store,
            agent,
            engine,
        } = setup(approvalModel('deploy'), undefined, {
            tools: () => ({ deploy: tool({ inputSchema: z.object({}), execute: async () => 'deployed' }) }),
            approvals: { deploy: 'user' },
        });
        const first = await runJob({
            engine,
            store,
            agent,
            clock,
        });
        expect(first.status).toBe('waiting');
        clock.advance(25 * 60 * 60_000);

        const pod2 = new RunEngine({
            store,
            agents: [agent],
            resumeSecret: 's',
            clock,
        });
        const second = await runJob({
            engine: pod2,
            store,
            agent,
            clock,
        });

        expect(second).toEqual({ status: 'skipped', exitCode: 0 });
        expect((await store.getRun(first.runId as string))?.status).toBe('completed');
    });

    it('returns queued when its run waits behind a run paused for an approval', async () => {
        const {
            clock,
            store,
            agent,
            engine,
        } = setup(approvalModel('deploy'), [cron('*/5 * * * *', { overlap: 'queue-one' })], {
            tools: () => ({ deploy: tool({ inputSchema: z.object({}), execute: async () => 'deployed' }) }),
            approvals: { deploy: 'user' },
        });
        const first = await runJob({
            engine,
            store,
            agent,
            clock,
        });
        expect(first.status).toBe('waiting');
        clock.advance(300_000);

        const pod2 = new RunEngine({
            store,
            agents: [agent],
            resumeSecret: 's',
            clock,
        });
        const drain = vi.spyOn(pod2, 'drain');
        const second = await runJob({
            engine: pod2,
            store,
            agent,
            clock,
        });

        expect(second).toMatchObject({ status: 'queued', exitCode: 0 });
        expect(second.runId).not.toBe(first.runId);
        expect((await store.getRun(second.runId as string))?.status).toBe('queued');
        expect((await store.getRun(first.runId as string))?.status).toBe('waiting');
        expect(drain).toHaveBeenCalledTimes(1);
    });

    it('resolves a run finished by another replica', async () => {
        const {
            clock,
            store,
            agent,
        } = setup(textModel());
        const a = new RunEngine({
            store,
            agents: [agent],
            resumeSecret: 's',
            clock,
            owner: 'a',
            maxConcurrentRuns: 0,
        });
        const b = new RunEngine({
            store,
            agents: [agent],
            resumeSecret: 's',
            clock,
            owner: 'b',
        });

        const job = runJob({
            engine: a,
            store,
            agent,
            clock,
            pollMs: 1_000,
        });
        await vi.waitFor(async () => expect((await store.listRuns({ agent: 'sweep' })).total).toBe(1));
        await b.start();
        await b.idle();
        clock.advance(1_000);

        await expect(job).resolves.toMatchObject({ status: 'completed', exitCode: 0 });
        await b.drain();
    });

    it('stops polling once it returned', async () => {
        const {
            clock,
            store,
            agent,
            engine,
        } = setup(textModel());
        const getRun = vi.spyOn(engine, 'getRun');
        // the run settles while a poll is in flight
        const { promise: gate, resolve: release } = Promise.withResolvers<void>();
        getRun.mockImplementationOnce(async (id) => {
            await gate;
            return store.getRun(id);
        });

        const job = runJob({
            engine,
            store,
            agent,
            clock,
            pollMs: 1_000,
        });
        await vi.waitFor(() => expect(getRun).toHaveBeenCalledTimes(1));
        await engine.idle();
        await expect(job).resolves.toMatchObject({ status: 'completed' });
        release();
        await vi.waitFor(() => expect(getRun.mock.results[0]?.type).toBe('return'));
        await new Promise((resolve) => {
            setImmediate(resolve);
        });

        const calls = getRun.mock.calls.length;
        clock.advance(5_000);
        await new Promise((resolve) => {
            setImmediate(resolve);
        });
        expect(getRun.mock.calls.length).toBe(calls);
    });

    it('drains the engine when waiting for the run fails', async () => {
        const {
            clock,
            store,
            agent,
            engine,
        } = setup(textModel());
        const error = new Error('store down');
        vi.spyOn(engine, 'getRun').mockRejectedValue(error);
        vi.spyOn(engine, 'on').mockReturnValue(() => {});
        const drain = vi.spyOn(engine, 'drain');

        await expect(runJob({
            engine,
            store,
            agent,
            clock,
        })).rejects.toBe(error);
        expect(drain).toHaveBeenCalledWith({ timeoutMs: 30_000 });
    });

    it('drains the engine before returning', async () => {
        const {
            clock,
            store,
            agent,
            engine,
        } = setup(textModel());
        const drain = vi.spyOn(engine, 'drain');

        await runJob({
            engine,
            store,
            agent,
            clock,
        });

        expect(drain).toHaveBeenCalledTimes(1);
        expect(drain).toHaveBeenCalledWith({ timeoutMs: 30_000 });
    });

    it('requires a trigger id when the agent has several cron triggers', async () => {
        const several = setup(textModel(), [cron('*/5 * * * *'), cron('0 * * * *')]);
        await expect(runJob({ ...several, clock: several.clock })).rejects.toThrow(InvalidAgentDefinitionError);
        await expect(runJob({ ...several, trigger: 'cron:nope' })).rejects.toThrow(InvalidAgentDefinitionError);

        const none = setup(textModel(), [manual()]);
        await expect(runJob({ ...none })).rejects.toThrow(InvalidAgentDefinitionError);
        await expect(runJob({ ...none, trigger: 'manual' })).rejects.toThrow(InvalidAgentDefinitionError);
    });

    it('fires a named trigger', async () => {
        const several = setup(textModel(), [cron('*/5 * * * *'), cron('0 * * * *')]);

        const result = await runJob({ ...several, trigger: 'cron:0 * * * *' });

        const run = await several.store.getRun(result.runId as string);
        expect(run?.trigger.trigger).toBe('cron:0 * * * *');
    });
});
