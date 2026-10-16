import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { tool } from 'ai';
import type { LanguageModel, ToolSet } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import {
    afterEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import { z } from 'zod';
import { RunEngine, defineAgent } from '@chamberu/core';
import type { Run, RunEngineOptions, RunEvent } from '@chamberu/core';
import { ControllableClock } from '../../../src/clock.ts';
import { MemoryStore } from '../../../src/store/memory.ts';
import { mockModel } from '../../utils/mock-model.ts';
import type { MockResponse } from '../../utils/mock-model.ts';

const engines: RunEngine[] = [];

/** Lets already-queued microtasks settle; not a sleep. */
const flush = () => new Promise<void>((resolve) => { setImmediate(resolve); });

const sleep = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

afterEach(() => {
    for (const e of engines) e.stop();
    engines.length = 0;
});

/** One model turn: a response, optionally held until `before` resolves, or a call that only settles by aborting. */
type Turn = MockResponse | 'hang' | { before: () => Promise<void>; response: MockResponse };

/** A model shared by several engines: turn N of the script answers the Nth call, whichever engine makes it. */
function scripted(script: Turn[]) {
    const calls: LanguageModelV4CallOptions[] = [];
    const model = new MockLanguageModelV4({
        doGenerate: async (options) => {
            const turn = script[calls.length];
            calls.push(options);
            if (!turn) throw new Error('mock script exhausted');
            if (turn === 'hang') {
                return new Promise((_resolve, reject) => {
                    options.abortSignal?.addEventListener('abort', () => reject(options.abortSignal?.reason));
                });
            }
            if ('before' in turn) {
                await turn.before();
                return mockModel([turn.response]).doGenerate(options);
            }
            return mockModel([turn]).doGenerate(options);
        },
    });
    return { model, calls };
}

const text = (t: string): MockResponse => ({ parts: [{ type: 'text', text: t }] });

const toolTurn: MockResponse = {
    parts: [{
        type: 'tool-call',
        toolName: 'lookup',
        input: { q: 1 },
    }],
};

function make(
    model: LanguageModel,
    opts: Partial<RunEngineOptions> & { store?: MemoryStore; tools?: () => ToolSet } = {},
) {
    const store = opts.store ?? new MemoryStore({ clock: opts.clock });
    const errors: unknown[] = [];
    const events: RunEvent[] = [];
    const agent = defineAgent({
        name: 'triage',
        instructions: 'You triage.',
        model,
        tools: opts.tools,
    });
    const engine = new RunEngine({
        store,
        agents: [agent],
        resumeSecret: 's',
        onError: (error) => {
            errors.push(error);
        },
        ...opts,
    });
    engine.on('run.updated', (e) => {
        events.push(e);
    });
    engine.on('step.appended', (e) => {
        events.push(e);
    });
    engines.push(engine);
    return {
        store,
        engine,
        errors,
        events,
    };
}

const env = {
    agent: 'triage',
    trigger: 'manual',
    source: 'manual' as const,
    payload: { issue: 42 },
};

function makeRun(id: string, overrides: Partial<Run> = {}): Run {
    const createdAt = new Date(1_000);
    return {
        id,
        agent: 'triage',
        status: 'running',
        trigger: {
            ...env,
            id: `t-${id}`,
            receivedAt: createdAt,
        },
        usage: { inputTokens: 0, outputTokens: 0 },
        createdAt,
        updatedAt: createdAt,
        ...overrides,
    };
}

describe('graceful drain', () => {
    it('drain waits for short runs to complete', async () => {
        const { model, calls } = scripted([{ before: () => sleep(30), response: text('done') }]);
        const {
            engine,
            store,
            errors,
        } = make(model);
        await engine.start();
        const { runId } = await engine.dispatch(env);
        await vi.waitFor(() => expect(calls).toHaveLength(1));

        expect(engine.isDraining).toBe(false);
        const drained = engine.drain({ timeoutMs: 5_000 });
        expect(engine.isDraining).toBe(true);
        // a run dispatched meanwhile is stored, but its slot freeing up does not start it
        const { runId: later } = await engine.dispatch(env);
        await drained;

        expect(await store.getRun(runId)).toMatchObject({ status: 'completed', output: 'done' });
        await engine.idle();
        expect((await store.getRun(later))?.status).toBe('queued');
        expect(calls).toHaveLength(1);
        expect(errors).toEqual([]);
    });

    it('drain marks in-flight runs interrupted', async () => {
        const { model, calls } = scripted([toolTurn, 'hang']);
        const lookup = vi.fn(async () => 'found');
        const {
            engine,
            store,
            errors,
        } = make(model, {
            tools: () => ({
                lookup: tool({
                    inputSchema: z.object({ q: z.number() }),
                    execute: lookup,
                }),
            }),
        });
        await engine.start();
        const { runId } = await engine.dispatch(env);
        await vi.waitFor(() => expect(calls).toHaveLength(2));

        await engine.drain({ timeoutMs: 50 });

        const run = await store.getRun(runId);
        expect(run?.status).toBe('interrupted');
        expect(run?.claim).toBeUndefined();
        expect(run?.finishedAt).toBeUndefined();
        expect(run?.error).toBeUndefined();
        expect((await store.latestCheckpoint(runId))?.stepIndex).toBe(0);
        expect(errors).toEqual([]);
    });

    it('dispatch during drain stores queued run but does not start it', async () => {
        const clock = new ControllableClock();
        const { model, calls } = scripted([text('done')]);
        const { engine, store } = make(model, { clock, claimTtlMs: 900 });
        await engine.start();
        await engine.drain();
        const tick = vi.spyOn(engine, 'tick');

        const {
            runId,
            deduplicated,
        } = await engine.dispatch(env);
        expect(deduplicated).toBe(false);
        // polling (and with it tick) stopped too
        for (let i = 0; i < 5; i++) {
            clock.advance(900);
            await flush();
        }
        await engine.idle();

        expect((await store.getRun(runId))?.status).toBe('queued');
        expect(calls).toHaveLength(0);
        expect(tick).not.toHaveBeenCalled();
    });
});

describe('recovery', () => {
    it('recover resumes from last checkpoint', async () => {
        const { model, calls } = scripted([toolTurn, 'hang', text('done')]);
        const lookup = vi.fn(async () => 'found');
        const tools = () => ({
            lookup: tool({
                inputSchema: z.object({ q: z.number() }),
                execute: lookup,
            }),
        });
        const store = new MemoryStore();
        const a = make(model, {
            store,
            tools,
            owner: 'A',
        });
        const b = make(model, {
            store,
            tools,
            owner: 'B',
        });
        await a.engine.start();
        const { runId } = await a.engine.dispatch(env);
        await vi.waitFor(() => expect(calls).toHaveLength(2));
        await a.engine.drain({ timeoutMs: 50 });
        expect((await store.getRun(runId))?.status).toBe('interrupted');

        await b.engine.start();
        await b.engine.idle();

        const run = await store.getRun(runId);
        expect(run).toMatchObject({ status: 'completed', output: 'done' });
        expect(run?.claim).toBeUndefined();
        // step 0 (the tool call) was checkpointed: B continues after it instead of asking for it again
        expect(calls).toHaveLength(3);
        expect(lookup).toHaveBeenCalledTimes(1);
        const resumedPrompt = calls[2]!.prompt;
        expect(resumedPrompt.some((m) => m.role === 'tool' &&
            m.content.some((p) => p.type === 'tool-result' && p.toolName === 'lookup'))).toBe(true);
        const steps = await store.listSteps(runId);
        expect(steps.map((s) => s.kind)).toEqual(['llm', 'tool', 'llm']);
        expect(steps.map((s) => s.index)).toEqual([0, 1, 2]);
        expect(a.errors).toEqual([]);
        expect(b.errors).toEqual([]);
    });

    it('recover ignores runs with a live claim from another owner', async () => {
        const clock = new ControllableClock(new Date(10_000));
        const store = new MemoryStore({ clock });
        await store.createRun(makeRun('live'));
        await store.claimRun('live', 'other', 60_000);
        await store.createRun(makeRun('expired'));
        await store.claimRun('expired', 'other', 1_000);
        await store.createRun(makeRun('interrupted', { status: 'interrupted' }));
        await store.createRun(makeRun('waiting', { status: 'waiting' }));
        clock.advance(1_000);

        const { engine } = make(scripted([]).model, { store, clock });
        expect(await engine.recover()).toBe(2);

        expect(await store.getRun('live')).toMatchObject({ status: 'running', claim: { owner: 'other' } });
        expect(await store.getRun('expired')).toMatchObject({ status: 'queued' });
        expect((await store.getRun('expired'))?.claim).toBeUndefined();
        expect(await store.getRun('interrupted')).toMatchObject({ status: 'queued' });
        expect((await store.getRun('waiting'))?.status).toBe('waiting');
    });

    it('rejects late writes of an execution whose lease expired and was recovered elsewhere', async () => {
        // A's process stalls (its own clock never moves, so it never renews) while the lease expires in the store
        const shared = new ControllableClock();
        const store = new MemoryStore({ clock: shared });
        const { promise: stalled, resolve: release } = Promise.withResolvers<void>();
        const { model, calls } = scripted([{ before: () => stalled, response: text('A late') }, text('B done')]);
        const a = make(model, {
            store,
            clock: new ControllableClock(),
            owner: 'A',
            claimTtlMs: 1_000,
        });
        const b = make(model, {
            store,
            clock: shared,
            owner: 'B',
            claimTtlMs: 1_000,
        });
        await a.engine.start();
        const { runId } = await a.engine.dispatch(env);
        await vi.waitFor(() => expect(calls).toHaveLength(1));

        shared.advance(1_001);
        await b.engine.start();
        await b.engine.idle();
        expect(await store.getRun(runId)).toMatchObject({ status: 'completed', output: 'B done' });

        const before = a.events.length;
        release();
        await a.engine.idle();

        const run = await store.getRun(runId);
        expect(run).toMatchObject({ status: 'completed', output: 'B done' });
        expect(run?.claim).toBeUndefined();
        const steps = await store.listSteps(runId);
        expect(steps).toHaveLength(1);
        expect(steps[0]?.output).toMatchObject({ text: 'B done' });
        const checkpoint = await store.latestCheckpoint(runId);
        expect(JSON.stringify(checkpoint?.messages)).toContain('B done');
        expect(JSON.stringify(checkpoint?.messages)).not.toContain('A late');
        expect(a.events.slice(before)).toEqual([]);
        expect(a.errors).toEqual([]);
    });

    it('an execution that fails to renew its lease stops without writing, and is recovered after expiry', async () => {
        class FlakyStore extends MemoryStore {
            renewFails = false;

            override async renewClaim(...args: Parameters<MemoryStore['renewClaim']>) {
                if (this.renewFails) return false;
                return super.renewClaim(...args);
            }
        }
        const clock = new ControllableClock();
        const store = new FlakyStore({ clock });
        const { promise: stalled, resolve: release } = Promise.withResolvers<void>();
        const { model, calls } = scripted([{ before: () => stalled, response: text('late') }, text('again')]);
        const { engine, errors } = make(model, {
            store,
            clock,
            owner: 'A',
            claimTtlMs: 900,
        });
        await engine.start();
        const { runId } = await engine.dispatch(env);
        await vi.waitFor(() => expect(calls).toHaveLength(1));

        store.renewFails = true;
        clock.advance(300);
        await engine.idle();
        release();
        await flush();
        await engine.idle();

        // nothing written: the run keeps its (soon expired) claim and waits for recovery
        expect(await store.getRun(runId)).toMatchObject({ status: 'running', claim: { owner: 'A' } });
        expect(await store.listSteps(runId)).toEqual([]);
        expect(await store.latestCheckpoint(runId)).toBeUndefined();

        store.renewFails = false;
        clock.advance(1_000);
        await engine.recover();
        await engine.idle();
        expect(await store.getRun(runId)).toMatchObject({ status: 'completed', output: 'again' });
        expect(calls).toHaveLength(2);
        expect(errors).toEqual([]);
    });
});
