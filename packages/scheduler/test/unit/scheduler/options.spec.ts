/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { MemoryScheduleLock } from '@hubwire/test';
import { 
    describe, 
    expect, 
    it, 
    vi, 
} from 'vitest';
import {
    MemoryStore,
    RunEngine,
    cron,
    defineAgent,
} from '@chamberu/core';
import { ControllableClock } from '@chamberu/test-kit';
import { buildComponentOptions } from '../../../src/scheduler/helpers.ts';
import { textModel } from '../../utils/model.ts';

const T = new Date('2026-03-01T08:00:00.000Z');

function setup() {
    const clock = new ControllableClock(T);
    const store = new MemoryStore({ clock });
    const trigger = cron('0 9 * * *', { timezone: 'Europe/Berlin' });
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
    const lock = new MemoryScheduleLock();
    const onError = vi.fn();
    const options = buildComponentOptions({
        engine,
        store,
        lock,
        lockTtlMs: 600_000,
        onError,
    }, agent, trigger);
    return {
        store,
        lock,
        onError,
        options,
    };
}

describe('buildComponentOptions', () => {
    it('maps a cron trigger to component options', () => {
        const { lock, options } = setup();

        expect(options).toMatchObject({
            name: 'cron:sweep:cron:0 9 * * *',
            schedule: '0 9 * * *',
            timezone: 'Europe/Berlin',
            runOnStart: false,
            lockTtlMs: 600_000,
        });
        expect(options.lock).toBe(lock);
    });

    it('run fires the trigger at the scheduled time', async () => {
        const { store, options } = setup();

        await options.run({ scheduledAt: T });

        const { data } = await store.listRuns({ agent: 'sweep' });
        expect(data).toHaveLength(1);
        expect(data[0]?.trigger.idempotencyKey).toMatch(/@2026-03-01T08:00:00\.000Z$/);
    });

    it('hooks.onError carries agent and trigger', () => {
        const { onError, options } = setup();
        const error = new Error('boom');

        options.hooks?.onError?.(error);

        expect(onError).toHaveBeenCalledWith(error, { agent: 'sweep', trigger: 'cron:0 9 * * *' });
    });
});
