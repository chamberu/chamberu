import { tool } from 'ai';
import type { ToolSet } from 'ai';
import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';
import { z } from 'zod';
import { RunEngine, defineAgent } from '@chamberu/core';
import {
    EFFECT,
    defineEffectTool,
    effectMarker,
    stableHash,
    wrapToolsForRun,
} from '../../../src/effect/index.ts';
import type { RunContext } from '../../../src/run/types.ts';
import { MemoryStore } from '../../../src/store/memory.ts';
import { mockModel } from '../../utils/mock-model.ts';

const ctx: RunContext = {
    runId: 'r1',
    agent: 'triage',
    trigger: {
        agent: 'triage',
        trigger: 'manual',
        source: 'manual',
        payload: {},
    } as RunContext['trigger'],
    signal: new AbortController().signal,
};
const callOpts = { toolCallId: 'c', messages: [] };
const schema = z.object({ body: z.string(), n: z.number().optional() });

const engines: RunEngine[] = [];
afterEach(() => {
    for (const e of engines) e.stop();
    engines.length = 0;
});

async function call(tools: ToolSet, name: string, input: unknown) {
    const t = tools[name];
    return (t?.execute as (i: unknown, o: unknown) => Promise<unknown>)(input, callOpts);
}

describe('effect tools', () => {
    it('effect executes once per key', async () => {
        let runs = 0;
        const post = defineEffectTool({
            inputSchema: schema,
            execute: async () => ({ id: ++runs }),
        });
        const tools = wrapToolsForRun({ post }, ctx, new MemoryStore());
        const a = await call(tools, 'post', { body: 'hi' });
        const b = await call(tools, 'post', { body: 'hi' });
        const c = await call(tools, 'post', { body: 'other' });
        expect(a).toEqual({ id: 1 });
        expect(b).toEqual({ id: 1 });
        expect(c).toEqual({ id: 2 });
        expect(runs).toBe(2);
    });

    it('effect is not reapplied after resume', async () => {
        let runs = 0;
        const post = defineEffectTool({
            inputSchema: schema,
            execute: async () => ({ id: ++runs }),
        });
        // a crash before the checkpoint lands: the resumed run starts from scratch
        class NoCheckpointStore extends MemoryStore {
            override async saveCheckpoint(): Promise<void> {
                await Promise.resolve();
            }
        }
        const store = new NoCheckpointStore();
        const turn = {
            parts: [{
                type: 'tool-call' as const,
                toolName: 'post',
                input: { body: 'hi' },
            }],
        };
        const done = { parts: [{ type: 'text' as const, text: 'done' }] };
        const make = (model: ReturnType<typeof mockModel>) => {
            const engine = new RunEngine({
                store,
                agents: [defineAgent({
                    name: 'triage',
                    instructions: 'x',
                    model,
                    tools: () => ({ post }),
                })],
                resumeSecret: 's',
                onError: () => {},
            });
            engines.push(engine);
            return engine;
        };

        const first = make(mockModel([turn, done]));
        await first.start();
        const { runId } = await first.dispatch({
            agent: 'triage',
            trigger: 'manual',
            source: 'manual',
            payload: {},
        });
        await first.idle();
        first.stop();
        expect(runs).toBe(1);

        // the process died mid-run: requeue and resume with a model re-issuing the call
        await store.updateRun(runId, { status: 'queued', claim: undefined });
        const second = make(mockModel([turn, done]));
        await second.start();
        await second.idle();

        expect((await store.getRun(runId))?.status).toBe('completed');
        expect(runs).toBe(1);
    });

    it('alreadyApplied short-circuits execute', async () => {
        let runs = 0;
        const seen: string[] = [];
        const post = defineEffectTool({
            inputSchema: schema,
            execute: async () => ({ id: ++runs }),
            alreadyApplied: async (key) => {
                seen.push(key);
                return { id: 99 };
            },
        });
        const store = new MemoryStore();
        const tools = wrapToolsForRun({ post }, ctx, store);
        expect(await call(tools, 'post', { body: 'hi' })).toEqual({ id: 99 });
        expect(runs).toBe(0);
        expect(seen).toEqual([`r1:post:${stableHash({ body: 'hi' })}`]);
        expect(await store.getEffect(seen[0] as string)).toEqual({ result: { id: 99 } });
    });

    it('does not record the effect when execute throws', async () => {
        let runs = 0;
        const post = defineEffectTool({
            inputSchema: schema,
            execute: async () => {
                if (++runs === 1) throw new Error('boom');
                return 'ok';
            },
        });
        const tools = wrapToolsForRun({ post }, ctx, new MemoryStore());
        await expect(call(tools, 'post', { body: 'hi' })).rejects.toThrow('boom');
        expect(await call(tools, 'post', { body: 'hi' })).toBe('ok');
    });

    it('uses a custom effectKey', async () => {
        const post = defineEffectTool({
            inputSchema: schema,
            effectKey: (input) => `custom:${input.body}`,
            execute: async () => 'x',
        });
        const store = new MemoryStore();
        await call(wrapToolsForRun({ post }, ctx, store), 'post', { body: 'hi' });
        expect(await store.getEffect('custom:hi')).toEqual({ result: 'x' });
    });

    it('non-effect tools are not memoized', async () => {
        let runs = 0;
        const plain = tool({ inputSchema: schema, execute: async () => ++runs });
        const tools = wrapToolsForRun({ plain }, ctx, new MemoryStore());
        expect(tools.plain).toBe(plain);
        await call(tools, 'plain', { body: 'hi' });
        await call(tools, 'plain', { body: 'hi' });
        expect(runs).toBe(2);
    });

    it('marks effect tools', () => {
        const post = defineEffectTool({ inputSchema: schema, execute: async () => 1 });
        expect(post[EFFECT]).toBe(true);
    });

    it('effectMarker format', () => {
        expect(effectMarker('r1:post:abc')).toBe('<!-- chamberu:effect=r1:post:abc -->');
    });

    it('stableHash ignores key order and undefined, keeps array order', () => {
        expect(stableHash({ a: 1, b: { c: 2, d: 3 } })).toBe(stableHash({ b: { d: 3, c: 2 }, a: 1 }));
        expect(stableHash({ a: 1, b: undefined })).toBe(stableHash({ a: 1 }));
        expect(stableHash([1, 2])).not.toBe(stableHash([2, 1]));
    });
});
