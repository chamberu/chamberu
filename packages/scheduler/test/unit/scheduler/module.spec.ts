/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import type { Agent, TriggerDefinition } from '@chamberu/core';
import {
    InvalidAgentDefinitionError,
    MemoryStore,
    RunEngine,
    cron,
    defineAgent,
    http,
    manual,
} from '@chamberu/core';
import type { IScheduler, SchedulerOptions } from '@chamberu/scheduler';
import { createScheduler } from '@chamberu/scheduler';
import { textModel } from '../../utils/model.ts';

const agentWith = (triggers: TriggerDefinition[]) => defineAgent({
    name: 'sweep',
    model: textModel(),
    instructions: 'x',
    triggers,
});

describe('createScheduler', () => {
    let schedulers: IScheduler[] = [];

    const make = (
        store: MemoryStore,
        agents: Agent[],
        opts: Partial<SchedulerOptions> = {},
    ) => {
        const engine = new RunEngine({
            store,
            agents,
            resumeSecret: 's',
            owner: opts.owner,
        });
        const scheduler = createScheduler({
            engine,
            agents,
            store,
            onError: () => {},
            ...opts,
        });
        schedulers.push(scheduler);
        return scheduler;
    };

    const runs = async (store: MemoryStore) => (await store.listRuns({ agent: 'sweep' })).data;

    beforeEach(() => {
        vi.useFakeTimers({ now: new Date('2026-03-01T07:59:30Z') });
    });

    afterEach(async () => {
        await Promise.all(schedulers.map((s) => s.stop()));
        schedulers = [];
        vi.useRealTimers();
    });

    it('two replicas on one store dispatch once per tick', async () => {
        const store = new MemoryStore();
        const agents = [agentWith([cron('* * * * *', { overlap: 'allow' })])];
        const a = make(store, agents, { owner: 'a' });
        const b = make(store, agents, { owner: 'b' });
        await a.start();
        await b.start();

        await vi.advanceTimersByTimeAsync(60_000);
        expect(await runs(store)).toHaveLength(1);

        await vi.advanceTimersByTimeAsync(60_000);
        expect(await runs(store)).toHaveLength(2);
    });

    it('does not fire on start', async () => {
        const store = new MemoryStore();
        const scheduler = make(store, [agentWith([cron('* * * * *')])]);
        await scheduler.start();

        await vi.advanceTimersByTimeAsync(29_000);

        expect(await runs(store)).toHaveLength(0);
    });

    it('a restart between ticks dispatches nothing until the next tick', async () => {
        const store = new MemoryStore();
        const agents = [agentWith([cron('* * * * *')])];
        const before = make(store, agents, { owner: 'old' });
        await before.start();
        await vi.advanceTimersByTimeAsync(10_000);
        await before.stop();

        const after = make(store, agents, { owner: 'new' });
        await after.start();
        await vi.advanceTimersByTimeAsync(19_000);
        expect(await runs(store)).toHaveLength(0);

        await vi.advanceTimersByTimeAsync(1_000);
        expect(await runs(store)).toHaveLength(1);
    });

    it('honours the trigger timezone', async () => {
        const store = new MemoryStore();
        const scheduler = make(store, [agentWith([cron('0 9 * * *', { timezone: 'Europe/Berlin' })])]);
        await scheduler.start();

        await vi.advanceTimersByTimeAsync(60_000);

        const [run] = await runs(store);
        expect(run?.trigger.payload).toEqual({ scheduledAt: '2026-03-01T08:00:00.000Z' });
    });

    it('ignores non-cron triggers', async () => {
        const store = new MemoryStore();
        const scheduler = make(store, [agentWith([manual(), http({ path: '/sweep' })])]);
        await scheduler.start();

        await vi.advanceTimersByTimeAsync(120_000);

        expect(await runs(store)).toHaveLength(0);
    });

    it('stop() unschedules', async () => {
        const store = new MemoryStore();
        const scheduler = make(store, [agentWith([cron('* * * * *', { overlap: 'allow' })])]);
        await scheduler.start();
        await scheduler.stop();

        await vi.advanceTimersByTimeAsync(120_000);

        expect(await runs(store)).toHaveLength(0);
    });

    it('reports a failing lock and keeps ticking', async () => {
        const error = new Error('lock store down');
        const store = new MemoryStore();
        const acquire = store.acquire.bind(store);
        vi.spyOn(store, 'acquire')
            .mockRejectedValueOnce(error)
            .mockImplementation(acquire);
        const onError = vi.fn();
        const scheduler = make(store, [agentWith([cron('* * * * *', { overlap: 'allow' })])], { onError });
        await scheduler.start();

        await vi.advanceTimersByTimeAsync(60_000);
        expect(onError).toHaveBeenCalledWith(error, { agent: 'sweep', trigger: 'cron:* * * * *' });
        expect(await runs(store)).toHaveLength(0);

        await vi.advanceTimersByTimeAsync(60_000);
        expect(await runs(store)).toHaveLength(1);
    });

    it('rejects a cron trigger hubwire cannot schedule', () => {
        const store = new MemoryStore();
        const divergent = agentWith([cron('0 0 * * 1/2')]);
        expect(() => make(store, [divergent])).toThrow(InvalidAgentDefinitionError);
        expect(() => make(store, [divergent])).toThrow(/sweep.*cron:0 0 \* \* 1\/2/);

        const malformed = agentWith([{
            source: 'cron',
            id: 'bad',
            options: { expression: 'not a cron', overlap: 'skip' },
        }]);
        expect(() => make(store, [malformed])).toThrow(InvalidAgentDefinitionError);
        expect(() => make(store, [malformed])).toThrow(/sweep.*bad/);
    });

    it('rejects an invalid lockTtlMs', () => {
        const store = new MemoryStore();
        const agents = [agentWith([cron('* * * * *')])];
        expect(() => make(store, agents, { lockTtlMs: 0 })).toThrow(InvalidAgentDefinitionError);
    });

    it('rejects two agents with the same name', () => {
        const store = new MemoryStore();
        const engine = new RunEngine({
            store,
            agents: [],
            resumeSecret: 's',
        });
        const agents = [agentWith([cron('* * * * *')]), agentWith([cron('0 * * * *')])];

        expect(() => createScheduler({
            engine,
            agents,
            store,
        })).toThrow(InvalidAgentDefinitionError);
        expect(() => createScheduler({
            engine,
            agents,
            store,
        })).toThrow('"sweep" is used more than once');
    });
});
