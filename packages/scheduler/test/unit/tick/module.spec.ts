/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import type { TriggerDefinition } from '@chamberu/core';
import {
    InvalidAgentDefinitionError,
    MemoryStore,
    RunEngine,
    cron,
    defineAgent,
    http,
} from '@chamberu/core';
import { fireCronTrigger, readCronOptions } from '@chamberu/scheduler';
import { ControllableClock } from '@chamberu/test-kit';
import { textModel } from '../../utils/model.ts';

const T = new Date('2026-03-01T08:00:00.000Z');
const T_ISO = '2026-03-01T08:00:00.000Z';

function setup(trigger: TriggerDefinition = cron('*/5 * * * *')) {
    const clock = new ControllableClock(T);
    const store = new MemoryStore({ clock });
    const agent = defineAgent({
        name: 'sweep',
        model: textModel(),
        instructions: 'x',
        triggers: [trigger],
    });
    const engine = new RunEngine({
        store,
        agents: [agent],
        resumeSecret: 's',
        clock,
    });
    const fire = (scheduledAt: Date = T, t: TriggerDefinition = trigger) => fireCronTrigger({
        engine,
        store,
        agent,
        trigger: t,
        scheduledAt,
    });
    return {
        clock,
        store,
        agent,
        engine,
        fire,
    };
}

async function runOf(store: MemoryStore, result: Awaited<ReturnType<typeof fireCronTrigger>>) {
    if (!result.dispatched) throw new Error('not dispatched');
    const run = await store.getRun(result.runId);
    if (!run) throw new Error('run missing');
    return run;
}

describe('fireCronTrigger', () => {
    it('dispatches with the tick envelope', async () => {
        const { store, fire } = setup();

        const result = await fire();

        expect(result).toMatchObject({ dispatched: true, deduplicated: false });
        const run = await runOf(store, result);
        expect(run.trigger).toMatchObject({
            agent: 'sweep',
            trigger: 'cron:*/5 * * * *',
            source: 'cron',
            payload: { scheduledAt: T_ISO },
            idempotencyKey: `cron:*/5 * * * *@${T_ISO}`,
            concurrencyKey: 'cron:*/5 * * * *',
        });
        expect(run.concurrencyKey).toBe('cron:*/5 * * * *');
    });

    it('uses the trigger payload when set', async () => {
        const { store, fire } = setup(cron('0 * * * *', { payload: { full: true } }));

        const run = await runOf(store, await fire());

        expect(run.trigger.payload).toEqual({ full: true });
        expect(run.trigger.idempotencyKey).toBe(`cron:0 * * * *@${T_ISO}`);
    });

    it('derives the concurrency key from the payload', async () => {
        const { store, fire } = setup({
            ...cron('0 * * * *', { payload: { repo: 'a/b' } }),
            concurrencyKey: (p) => (p as { repo: string }).repo,
        });

        const run = await runOf(store, await fire());

        expect(run.concurrencyKey).toBe('a/b');
    });

    it('allow sets no concurrency key', async () => {
        const allow = setup(cron('0 * * * *', { overlap: 'allow' }));
        expect((await runOf(allow.store, await allow.fire())).concurrencyKey).toBeUndefined();

        const queueOne = setup(cron('0 * * * *', { overlap: 'queue-one' }));
        expect((await runOf(queueOne.store, await queueOne.fire())).concurrencyKey).toBe('cron:0 * * * *');
    });

    it('rejects a non-cron trigger', async () => {
        const { fire } = setup();

        const promise = fire(T, http());

        await expect(promise).rejects.toThrow(InvalidAgentDefinitionError);
        await expect(promise).rejects.toThrow(/sweep.*http/);
    });

    it('ignores the trigger\'s own idempotencyKey', async () => {
        const { store, fire } = setup({
            ...cron('*/5 * * * *', { overlap: 'allow' }),
            idempotencyKey: () => 'fixed',
        });

        await fire(T);
        await fire(new Date(T.getTime() + 300_000));

        expect((await store.listRuns({ agent: 'sweep' })).total).toBe(2);
    });

    it('a second firing of the same tick is deduplicated', async () => {
        const { store, fire } = setup(cron('*/5 * * * *', { overlap: 'allow' }));

        const first = await fire();
        const second = await fire();

        expect(first.dispatched && second).toEqual({
            dispatched: true,
            deduplicated: true,
            runId: first.dispatched ? first.runId : undefined,
        });
        expect((await store.listRuns({ agent: 'sweep' })).total).toBe(1);
    });
});

describe('readCronOptions', () => {
    it('reads a cron trigger', () => {
        const trigger = cron('0 9 * * *', { timezone: 'Europe/Berlin', overlap: 'queue-one' });
        const { agent } = setup(trigger);

        expect(readCronOptions(agent, trigger)).toEqual({
            expression: '0 9 * * *',
            timezone: 'Europe/Berlin',
            overlap: 'queue-one',
            payload: undefined,
        });
    });

    it('rejects a malformed cron trigger', () => {
        const { agent } = setup();

        expect(() => readCronOptions(agent, {
            source: 'cron',
            id: 'x',
            options: {},
        }))
            .toThrow(InvalidAgentDefinitionError);
        expect(() => readCronOptions(agent, {
            source: 'cron',
            id: 'x',
            options: {},
        }))
            .toThrow(/sweep.*x/);
        expect(() => readCronOptions(agent, {
            source: 'cron',
            id: 'x',
            options: { expression: '* * * * *', overlap: 'sometimes' },
        })).toThrow(InvalidAgentDefinitionError);
        expect(() => readCronOptions(agent, {
            source: 'cron',
            id: 'x',
            options: { expression: '* * * * *', timezone: 5 },
        })).toThrow(InvalidAgentDefinitionError);
    });

    it('reads a missing overlap as skip', () => {
        const { agent } = setup();

        expect(readCronOptions(agent, {
            source: 'cron',
            id: 'x',
            options: { expression: '* * * * *' },
        }).overlap).toBe('skip');
    });
});
