import type { LanguageModel } from 'ai';
import { describe, expect, it } from 'vitest';
import {
    InvalidAgentDefinitionError, 
    RunEngine, 
    defineAgent, 
} from '@chamberu/core';
import type { Run, RunEvent } from '@chamberu/core';
import { MemoryStore } from '../../../src/store/memory.ts';

const model = {} as LanguageModel;
const agent = defineAgent({
    name: 'triage', 
    model, 
    instructions: 'x', 
});

/** Engine whose executions block until released, to observe scheduling. */
class GatedEngine extends RunEngine {
    gates = new Map<string, () => void>();

    executed: string[] = [];

    protected override async execute(run: Run): Promise<void> {
        this.executed.push(run.id);
        await new Promise<void>((resolve) => {
            this.gates.set(run.id, resolve);
        });
        await super.execute(run);
    }

    async release(id: string): Promise<void> {
        await new Promise((r) => { setTimeout(r, 5); });
        this.gates.get(id)!();
        this.gates.delete(id);
        await new Promise((r) => { setTimeout(r, 5); });
    }
}

function setup(opts: { max?: number } = {}) {
    const store = new MemoryStore();
    const engine = new GatedEngine({
        store, 
        agents: [agent], 
        resumeSecret: 's', 
        maxConcurrentRuns: opts.max, 
    });
    return { store, engine };
}

const env = (extra: Record<string, unknown> = {}) => ({
    agent: 'triage', 
    trigger: 'manual', 
    source: 'manual' as const, 
    payload: {}, 
    ...extra,
});

const wait = () => new Promise((r) => { setTimeout(r, 20); });

describe('RunEngine.dispatch', () => {
    it('dispatch creates queued run', async () => {
        const { engine } = setup();
        const { runId, deduplicated } = await engine.dispatch(env());
        expect(deduplicated).toBe(false);
        const run = await engine.getRun(runId);
        expect(run?.status).toBe('queued');
        expect(run?.agent).toBe('triage');
        expect(run?.trigger.id).toBeTruthy();
    });

    it('dispatch dedupes identical idempotencyKey', async () => {
        const { engine } = setup();
        const a = await engine.dispatch(env({ idempotencyKey: 'k' }));
        const b = await engine.dispatch(env({ idempotencyKey: 'k' }));
        expect(b).toEqual({ runId: a.runId, deduplicated: true });
        const c = await engine.dispatch(env());
        const d = await engine.dispatch(env());
        expect(c.runId).not.toBe(d.runId);
    });

    it('dispatch dedupes concurrent identical keys', async () => {
        const { engine, store } = setup();
        const results = await Promise.all(
            Array.from({ length: 10 }, () => engine.dispatch(env({ idempotencyKey: 'same' }))),
        );
        expect(new Set(results.map((r) => r.runId)).size).toBe(1);
        expect(results.filter((r) => !r.deduplicated)).toHaveLength(1);
        expect((await store.listRuns({})).total).toBe(1);
    });

    it('dispatch rejects unknown agent', async () => {
        const { engine, store } = setup();
        await expect(engine.dispatch(env({ agent: 'nope' }))).rejects.toThrow(InvalidAgentDefinitionError);
        await expect(engine.dispatch(env({ agent: 'nope' }))).rejects.toThrow('unknown agent: nope');
        expect((await store.listRuns({})).total).toBe(0);
    });

    it('runs with the same concurrencyKey execute one at a time', async () => {
        const { engine } = setup();
        const events: string[] = [];
        engine.on('run.updated', (e: RunEvent) => {
            if (e.type === 'run.updated') events.push(`${e.run.id}:${e.run.status}`);
        });
        await engine.start();
        const a = await engine.dispatch(env({ concurrencyKey: 'c' }));
        const b = await engine.dispatch(env({ concurrencyKey: 'c' }));
        await wait();
        expect(engine.executed).toEqual([a.runId]);
        await engine.release(a.runId);
        await wait();
        expect(engine.executed).toEqual([a.runId, b.runId]);
        await engine.release(b.runId);
        await engine.idle();
        expect(events.filter((e) => !e.endsWith('queued'))).toEqual([
            `${a.runId}:running`, 
            `${a.runId}:completed`, 
            `${b.runId}:running`, 
            `${b.runId}:completed`,
        ]);
    });

    it('does not start a run while another replica holds the same concurrencyKey', async () => {
        const { engine, store } = setup();
        const other = await engine.dispatch(env({ concurrencyKey: 'c' }));
        await store.updateRun(other.runId, { status: 'waiting' });
        await engine.start();
        await engine.dispatch(env({ concurrencyKey: 'c' }));
        await wait();
        expect(engine.executed).toEqual([]);
    });

    it('different concurrencyKeys run in parallel', async () => {
        const { engine } = setup();
        await engine.start();
        const a = await engine.dispatch(env({ concurrencyKey: 'a' }));
        const b = await engine.dispatch(env({ concurrencyKey: 'b' }));
        await wait();
        expect(engine.executed.sort()).toEqual([a.runId, b.runId].sort());
        await engine.release(a.runId);
        await engine.release(b.runId);
        await engine.idle();
    });

    it('maxConcurrentRuns is respected and starts are FIFO', async () => {
        const { engine } = setup({ max: 2 });
        await engine.start();
        const ids: string[] = [];
        for (let i = 0; i < 4; i++) ids.push((await engine.dispatch(env())).runId);
        await wait();
        expect(engine.executed).toEqual([ids[0], ids[1]]);
        await engine.release(ids[0]!);
        await wait();
        expect(engine.executed).toEqual([ids[0], ids[1], ids[2]]);
        await engine.release(ids[1]!);
        await engine.release(ids[2]!);
        await wait();
        await engine.release(ids[3]!);
        await engine.idle();
        for (const id of ids) expect((await engine.getRun(id))?.status).toBe('completed');
    });
});
