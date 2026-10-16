/* eslint-disable max-classes-per-file */
import type { LanguageModel } from 'ai';
import {
    afterEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import {
    InvalidAgentDefinitionError,
    RunEngine,
    defineAgent,
} from '@chamberu/core';
import type { Run, RunEngineOptions, RunEvent } from '@chamberu/core';
import { ControllableClock } from '../../../src/clock.ts';
import { MemoryStore } from '../../../src/store/memory.ts';

const model = {} as LanguageModel;
const agent = defineAgent({
    name: 'triage',
    model,
    instructions: 'x',
});

/** Lets already-queued microtasks (all MemoryStore work) settle; not a sleep. */
const flush = () => new Promise<void>((resolve) => { setImmediate(resolve); });

/** Engine whose executions block until released, to observe scheduling. */
class GatedEngine extends RunEngine {
    gates = new Map<string, () => void>();

    executed: string[] = [];

    active = 0;

    maxActive = 0;

    /** Shared across engines to observe cross-replica overlap. */
    tracker = { active: 0, maxActive: 0 };

    failWith: Error | undefined;

    protected override async execute(run: Run): Promise<void> {
        this.executed.push(run.id);
        this.tracker.active++;
        this.tracker.maxActive = Math.max(this.tracker.maxActive, this.tracker.active);
        try {
            if (this.failWith) throw this.failWith;
            await new Promise<void>((resolve) => {
                this.gates.set(run.id, resolve);
            });
            await super.execute(run);
        } finally {
            this.tracker.active--;
        }
    }

    async release(id: string): Promise<void> {
        await vi.waitFor(() => expect(this.gates.has(id)).toBe(true));
        this.gates.get(id)!();
        this.gates.delete(id);
    }
}

/** Marking a run `running` lands a few ticks late, widening the check-then-start race window. */
class SlowStartStore extends MemoryStore {
    override async updateRun(...args: Parameters<MemoryStore['updateRun']>) {
        if (args[1].status === 'running') {
            for (let i = 0; i < 5; i++) await flush();
        }
        return super.updateRun(...args);
    }
}

const engines: RunEngine[] = [];

afterEach(() => {
    for (const e of engines) e.stop();
    engines.length = 0;
});

function make(opts: Partial<RunEngineOptions> & { store?: MemoryStore } = {}) {
    const store = opts.store ?? new MemoryStore();
    const engine = new GatedEngine({
        store,
        agents: [agent],
        resumeSecret: 's',
        onError: () => {},
        ...opts,
    });
    engines.push(engine);
    return { store, engine };
}

const env = (extra: Record<string, unknown> = {}) => ({
    agent: 'triage',
    trigger: 'manual',
    source: 'manual' as const,
    payload: {},
    ...extra,
});

const statusOf = async (engine: RunEngine, id: string) => (await engine.getRun(id))?.status;

describe('RunEngine.dispatch', () => {
    it('dispatch creates queued run', async () => {
        const { engine } = make();
        const { runId, deduplicated } = await engine.dispatch(env());
        expect(deduplicated).toBe(false);
        const run = await engine.getRun(runId);
        expect(run?.status).toBe('queued');
        expect(run?.agent).toBe('triage');
        expect(run?.trigger.id).toBeTruthy();
    });

    it('dispatch dedupes identical idempotencyKey', async () => {
        const { engine } = make();
        const a = await engine.dispatch(env({ idempotencyKey: 'k' }));
        const b = await engine.dispatch(env({ idempotencyKey: 'k' }));
        expect(b).toEqual({ runId: a.runId, deduplicated: true });
        const c = await engine.dispatch(env());
        const d = await engine.dispatch(env());
        expect(c.runId).not.toBe(d.runId);
    });

    it('dispatch dedupes concurrent identical keys', async () => {
        const { engine, store } = make();
        const results = await Promise.all(
            Array.from({ length: 10 }, () => engine.dispatch(env({ idempotencyKey: 'same' }))),
        );
        expect(new Set(results.map((r) => r.runId)).size).toBe(1);
        expect(results.filter((r) => !r.deduplicated)).toHaveLength(1);
        expect((await store.listRuns({})).total).toBe(1);
    });

    it('dispatch rejects unknown agent', async () => {
        const { engine, store } = make();
        await expect(engine.dispatch(env({ agent: 'nope' }))).rejects.toThrow(InvalidAgentDefinitionError);
        await expect(engine.dispatch(env({ agent: 'nope' }))).rejects.toThrow('unknown agent: nope');
        expect((await store.listRuns({})).total).toBe(0);
    });

    it('runs with the same concurrencyKey execute one at a time', async () => {
        const { engine } = make();
        const events: string[] = [];
        engine.on('run.updated', (e: RunEvent) => {
            if (e.type === 'run.updated') events.push(`${e.run.id}:${e.run.status}`);
        });
        await engine.start();
        const a = await engine.dispatch(env({ concurrencyKey: 'c' }));
        const b = await engine.dispatch(env({ concurrencyKey: 'c' }));
        await vi.waitFor(() => expect(engine.executed).toEqual([a.runId]));
        await flush();
        expect(engine.executed).toEqual([a.runId]);
        await engine.release(a.runId);
        await vi.waitFor(() => expect(engine.executed).toEqual([a.runId, b.runId]));
        await engine.release(b.runId);
        await engine.idle();
        expect(events.filter((e) => !e.endsWith('queued'))).toEqual([
            `${a.runId}:running`,
            `${a.runId}:completed`,
            `${b.runId}:running`,
            `${b.runId}:completed`,
        ]);
    });

    it('does not start a run while a waiting run holds the same concurrencyKey', async () => {
        const { engine, store } = make();
        const other = await engine.dispatch(env({ concurrencyKey: 'c' }));
        await store.updateRun(other.runId, { status: 'waiting' });
        await engine.start();
        await engine.dispatch(env({ concurrencyKey: 'c' }));
        await flush();
        expect(engine.executed).toEqual([]);
    });

    it('different concurrencyKeys run in parallel', async () => {
        const { engine } = make();
        await engine.start();
        const a = await engine.dispatch(env({ concurrencyKey: 'a' }));
        const b = await engine.dispatch(env({ concurrencyKey: 'b' }));
        await vi.waitFor(() => expect(engine.executed.toSorted()).toEqual([a.runId, b.runId].toSorted()));
        await engine.release(a.runId);
        await engine.release(b.runId);
        await engine.idle();
    });

    it('maxConcurrentRuns is respected and starts are FIFO', async () => {
        const { engine } = make({ maxConcurrentRuns: 2 });
        await engine.start();
        const ids: string[] = [];
        for (let i = 0; i < 4; i++) ids.push((await engine.dispatch(env())).runId);
        await vi.waitFor(() => expect(engine.executed).toEqual([ids[0], ids[1]]));
        await flush();
        expect(engine.executed).toEqual([ids[0], ids[1]]);
        await engine.release(ids[0]!);
        await vi.waitFor(() => expect(engine.executed).toEqual([ids[0], ids[1], ids[2]]));
        await engine.release(ids[1]!);
        await engine.release(ids[2]!);
        await vi.waitFor(() => expect(engine.executed).toHaveLength(4));
        await engine.release(ids[3]!);
        await engine.idle();
        for (const id of ids) expect(await statusOf(engine, id)).toBe('completed');
    });

    it('same-key runs on two replicas sharing a store never overlap', async () => {
        const store = new SlowStartStore();
        const a = make({
            store,
            owner: 'a',
            claimTtlMs: 30,
        });
        const b = make({
            store,
            owner: 'b',
            claimTtlMs: 30,
        });
        b.engine.tracker = a.engine.tracker;
        const [ra, rb] = await Promise.all([
            a.engine.dispatch(env({ concurrencyKey: 'c' })),
            b.engine.dispatch(env({ concurrencyKey: 'c' })),
        ]);
        await Promise.all([a.engine.start(), b.engine.start()]);
        const holder = (id: string) => (a.engine.gates.has(id) ? a.engine : b.engine);
        await vi.waitFor(() => expect(a.engine.executed.length + b.engine.executed.length).toBe(1));
        for (let i = 0; i < 15; i++) await flush();
        expect(a.engine.executed.length + b.engine.executed.length).toBe(1);
        expect(a.engine.tracker.maxActive).toBe(1);
        const first = a.engine.executed[0] ?? b.engine.executed[0]!;
        await holder(first).release(first);
        const second = first === ra.runId ? rb.runId : ra.runId;
        await vi.waitFor(() => expect(a.engine.executed.length + b.engine.executed.length).toBe(2));
        await holder(second).release(second);
        await vi.waitFor(async () => expect(await statusOf(a.engine, second)).toBe('completed'));
        expect(a.engine.tracker.maxActive).toBe(1);
    });

    it('picks up a run unblocked outside this process once the poll fires', async () => {
        const clock = new ControllableClock(new Date('2026-01-01T00:00:00Z'));
        const store = new MemoryStore({ clock });
        const { engine } = make({
            store,
            clock,
            claimTtlMs: 300,
        });
        const blocker = await engine.dispatch(env({ concurrencyKey: 'c' }));
        await store.updateRun(blocker.runId, { status: 'running' });
        await engine.start();
        const { runId } = await engine.dispatch(env({ concurrencyKey: 'c' }));
        await flush();
        expect(await statusOf(engine, runId)).toBe('queued');

        await store.updateRun(blocker.runId, { status: 'completed' });
        clock.advance(100);
        await vi.waitFor(() => expect(engine.executed).toEqual([runId]));
        await engine.release(runId);
        await engine.idle();
        expect(await statusOf(engine, runId)).toBe('completed');
    });

    it('a store failure inside a pass is reported, not thrown', async () => {
        const store = new MemoryStore();
        const onError = vi.fn();
        const { engine } = make({ store, onError });
        vi.spyOn(store, 'listRuns').mockRejectedValueOnce(new Error('boom'));
        await engine.dispatch(env());
        await expect(engine.start()).resolves.toBeUndefined();
        expect(onError.mock.calls[0]?.[0]).toMatchObject({ message: 'boom' });
    });

    it('an execute throw marks the run failed and releases the claim', async () => {
        const onError = vi.fn();
        const { engine, store } = make({ onError });
        engine.failWith = Object.assign(new Error('nope'), { code: 'tool_broke' });
        const updates: Run['status'][] = [];
        engine.on('run.updated', (e) => {
            if (e.type === 'run.updated') updates.push(e.run.status);
        });
        await engine.start();
        const { runId } = await engine.dispatch(env());
        await engine.idle();
        const run = await store.getRun(runId);
        expect(run?.status).toBe('failed');
        expect(run?.error).toEqual({ code: 'tool_broke', message: 'nope' });
        expect(run?.claim).toBeUndefined();
        expect(updates).toContain('failed');
        expect(onError).toHaveBeenCalled();
    });

    it('a throwing listener does not break the engine', async () => {
        const onError = vi.fn();
        const { engine } = make({ onError });
        engine.on('run.updated', () => {
            throw new Error('listener');
        });
        const { runId } = await engine.dispatch(env());
        expect(await statusOf(engine, runId)).toBe('queued');
        expect(onError).toHaveBeenCalled();
    });
});
