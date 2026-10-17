/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import type { RunStatusLiteral, TriggerDefinition } from '@chamberu/core';
import {
    MemoryStore,
    RunEngine,
    cron,
    defineAgent,
} from '@chamberu/core';
import type { CronTickResult } from '@chamberu/scheduler';
import { fireCronTrigger } from '@chamberu/scheduler';
import { ControllableClock } from '@chamberu/test-kit';
import { textModel } from '../../utils/model.ts';

const T = new Date('2026-03-01T08:00:00.000Z');
const at = (tick: number) => new Date(T.getTime() + tick * 300_000);

function setup(triggers: TriggerDefinition[]) {
    const clock = new ControllableClock(T);
    const store = new MemoryStore({ clock });
    const agent = defineAgent({
        name: 'sweep',
        model: textModel(),
        instructions: 'x',
        triggers,
    });
    const engine = new RunEngine({
        store,
        agents: [agent],
        resumeSecret: 's',
        clock,
    });
    const fire = (tick: number, trigger: TriggerDefinition = triggers[0] as TriggerDefinition) => fireCronTrigger({
        engine,
        store,
        agent,
        trigger,
        scheduledAt: at(tick),
    });
    return {
        clock,
        store,
        agent,
        engine,
        fire,
    };
}

function idOf(result: CronTickResult): string {
    if (!result.dispatched) throw new Error('not dispatched');
    return result.runId;
}

describe('overlap', () => {
    it.each<RunStatusLiteral>(['queued', 'running', 'waiting', 'interrupted'])(
        'skip: skips while a run of the trigger is %s',
        async (status) => {
            const { store, fire } = setup([cron('*/5 * * * *')]);
            const id = idOf(await fire(0));
            await store.updateRun(id, { status });

            expect(await fire(1)).toEqual({ dispatched: false, reason: 'overlap' });
        },
    );

    it.each<RunStatusLiteral>(['completed', 'failed', 'cancelled'])(
        'skip: dispatches once the run is %s',
        async (status) => {
            const { store, fire } = setup([cron('*/5 * * * *')]);
            const id = idOf(await fire(0));
            await store.updateRun(id, { status });

            expect(await fire(1)).toMatchObject({ dispatched: true, deduplicated: false });
        },
    );

    it('skip: runs of another trigger of the same agent do not block', async () => {
        const first = cron('*/5 * * * *');
        const second = cron('0 * * * *');
        const { store, fire } = setup([first, second]);
        const id = idOf(await fire(0, second));
        await store.updateRun(id, { status: 'running' });

        expect(await fire(0, first)).toMatchObject({ dispatched: true });
    });

    it('queue-one: queues one behind an active run', async () => {
        const trigger = cron('*/5 * * * *', { overlap: 'queue-one' });
        const { store, fire } = setup([trigger]);
        const run1 = idOf(await fire(0));
        await store.updateRun(run1, { status: 'running' });

        const run2 = idOf(await fire(1));
        expect((await store.getRun(run2))?.concurrencyKey).toBe(trigger.id);
        expect(await fire(2)).toEqual({ dispatched: false, reason: 'overlap' });

        await store.updateRun(run2, { status: 'running' });
        expect(await fire(3)).toMatchObject({ dispatched: true });
    });

    it('queue-one: the queued run waits for the running one', async () => {
        const {
            clock, 
            store, 
            engine, 
            fire, 
        } = setup([cron('*/5 * * * *', { overlap: 'queue-one' })]);
        const run1 = idOf(await fire(0));
        // running on another replica, which holds a live claim (recovery leaves it alone)
        await store.claimRun(run1, 'elsewhere', 60_000);
        await store.updateRun(run1, { status: 'running' });
        await engine.start();

        const run2 = idOf(await fire(1));
        await engine.idle();
        expect((await store.getRun(run2))?.status).toBe('queued');

        await store.updateRun(run1, { status: 'completed' });
        clock.advance(20_000);
        await engine.idle();
        expect((await store.getRun(run2))?.status).toBe('completed');

        await engine.drain();
    });

    it('allow: always dispatches', async () => {
        const { store, fire } = setup([cron('*/5 * * * *', { overlap: 'allow' })]);

        await fire(0);
        await fire(1);
        await fire(2);

        expect((await store.listRuns({ agent: 'sweep' })).total).toBe(3);
    });
});
