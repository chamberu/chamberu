/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { Engine, defineAgent, http } from '@chamvi/core';
import type { EngineOptions } from '@chamvi/core';
import { ControllableClock } from '../../utils/clock.ts';
import { mockModel } from '../../utils/mock-model.ts';
import { MemoryStore } from '../../../src/store/index.ts';

const answers = (text: string) => Array.from({ length: 5 }, () => ({ parts: [{ type: 'text' as const, text }] }));
const agent = (text: string) => defineAgent({
    name: 'triage',
    model: mockModel(answers(text)),
    instructions: 'x',
    triggers: [http()],
});

/** Holds the next marker write or delete at a gate until released. */
class GatedStore extends MemoryStore {
    gate?: Promise<void>;

    entered?: () => void;

    override async setAgentRevision(...args: Parameters<MemoryStore['setAgentRevision']>) {
        await this.pass();
        return super.setAgentRevision(...args);
    }

    override async deleteAgentRevision(...args: Parameters<MemoryStore['deleteAgentRevision']>) {
        await this.pass();
        return super.deleteAgentRevision(...args);
    }

    arm(): Promise<void> {
        const gate = Promise.withResolvers<void>();
        this.gate = gate.promise;
        this.open = () => {
            this.gate = undefined;
            gate.resolve();
        };
        const entered = Promise.withResolvers<void>();
        this.entered = entered.resolve;
        return entered.promise;
    }

    open: () => void = () => {};

    protected async pass(): Promise<void> {
        if (!this.gate) return;
        this.entered?.();
        await this.gate;
    }
}

function createEngine(store: MemoryStore, clock: ControllableClock, extra: Partial<EngineOptions> = {}): Engine {
    return new Engine({
        store,
        clock,
        agents: [],
        resumeSecret: 's',
        onError: () => {},
        ...extra,
    });
}

const dispatch = (engine: Engine) => engine.dispatch({
    agent: 'triage',
    trigger: 'http',
    source: 'http',
    payload: {},
});

describe('registry races', () => {
    it('a run dispatched while putAgent replaces never executes on the old code', async () => {
        const clock = new ControllableClock(new Date(1_000_000));
        const store = new GatedStore({ clock });
        const engine = createEngine(store, clock);
        await engine.putAgent(agent('old code'), { revision: 'h1' });
        await engine.start();

        const entered = store.arm();
        const replacing = engine.putAgent(agent('new code'), { revision: 'h2' });
        await entered;
        clock.advance(1);
        const { runId } = await dispatch(engine);
        await engine.idle();
        store.open();
        await replacing;
        clock.advance(60_000);
        await engine.idle();

        const run = await store.getRun(runId);
        expect(run?.output).not.toBe('old code');
        engine.stop();
    });

    it('a queued run created while the marker moves is kept and runs on the new code', async () => {
        const clock = new ControllableClock(new Date(1_000_000));
        const store = new GatedStore({ clock });
        const a = createEngine(store, clock, { owner: 'a' });
        const b = createEngine(store, clock, { owner: 'b' });
        await a.putAgent(agent('old code'), { revision: 'h1' });
        await b.putAgent(agent('old code'), { revision: 'h1' });

        const entered = store.arm();
        const replacing = a.putAgent(agent('new code'), { revision: 'h2' });
        await entered;
        clock.advance(1);
        const { runId } = await dispatch(b);
        store.open();
        await replacing;
        expect((await store.getRun(runId))?.status).toBe('queued');

        await b.putAgent(agent('new code'), { revision: 'h2' });
        await b.start();
        await b.idle();
        expect((await store.getRun(runId))?.output).toBe('new code');
        b.stop();
    });

    it('a run dispatched on a lagging replica between two removals is cancelled', async () => {
        const clock = new ControllableClock(new Date(1_000_000));
        const store = new MemoryStore({ clock });
        const a = createEngine(store, clock, { owner: 'a' });
        const b = createEngine(store, clock, { owner: 'b' });
        await a.putAgent(agent('v1'), { revision: 'h1' });
        await b.putAgent(agent('v1'), { revision: 'h1' });
        await a.removeAgent('triage');
        clock.advance(10);
        const { runId } = await dispatch(b);
        await b.removeAgent('triage');

        expect((await store.getRun(runId))?.status).toBe('cancelled');
    });

    it('a dispatch while removeAgent cancels is refused', async () => {
        const clock = new ControllableClock(new Date(1_000_000));
        const store = new GatedStore({ clock });
        const engine = createEngine(store, clock);
        await engine.putAgent(agent('v1'), { revision: 'h1' });

        const entered = store.arm();
        const removing = engine.removeAgent('triage');
        await entered;
        await expect(dispatch(engine)).rejects.toThrow();
        store.open();
        await removing;
        expect(engine.getAgent('triage')).toBeUndefined();
    });

    it('a removal at an older revision leaves a newer marker and its runs alone', async () => {
        const clock = new ControllableClock(new Date(1_000_000));
        const store = new MemoryStore({ clock });
        const a = createEngine(store, clock, { owner: 'a' });
        const b = createEngine(store, clock, { owner: 'b' });
        await a.putAgent(agent('v1'), { revision: 'h1' });
        await b.putAgent(agent('v1'), { revision: 'h1' });
        await b.putAgent(agent('v2'), { revision: 'h2' });
        clock.advance(10);
        const { runId } = await dispatch(b);

        await a.removeAgent('triage');

        expect((await store.getAgentRevision('triage'))?.hash).toBe('h2');
        expect((await store.getRun(runId))?.status).toBe('queued');
    });
});
