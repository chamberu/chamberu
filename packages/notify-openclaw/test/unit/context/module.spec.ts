/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { LanguageModel } from 'ai';
import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';
import { z } from 'zod';
import {
    Engine,
    InvalidAgentDefinitionError,
    MemoryStore,
    defineAgent,
    defineTool,
} from '@chamvi/core';
import type { AgentDefinition, ToolContext } from '@chamvi/core';
import { injectOpenclawContext, openclaw, provideOpenclawContext } from '@chamvi/notify-openclaw';
import type { OpenclawNotifierOptions } from '@chamvi/notify-openclaw';
import { ControllableClock } from '@chamvi/test-kit';
import { mockModel } from '../../utils/model.ts';
import type { MockResponse } from '../../utils/model.ts';
import { createFakeOpenclaw } from '../../utils/openclaw.ts';

const TOKEN = 'hooks-token-0123456789';

const engines: Engine[] = [];

afterEach(async () => {
    await Promise.all(engines.map((engine) => engine.stop()));
    engines.length = 0;
});

const callUse: MockResponse = {
    parts: [{
        type: 'tool-call',
        toolName: 'use',
        input: {},
    }],
};
const done: MockResponse = { parts: [{ type: 'text', text: 'done' }] };

function setup(model: LanguageModel, tools: AgentDefinition['tools']) {
    const clock = new ControllableClock(new Date('2026-10-21T09:00:00Z'));
    const fake = createFakeOpenclaw({ token: TOKEN, clock });
    const store = new MemoryStore({ clock });
    const engine = new Engine({
        store,
        agents: [defineAgent({
            name: 'reporter',
            model,
            instructions: 'Report.',
            tools,
        })],
        resumeSecret: 'resume-secret',
        clock,
        onError: () => {},
    });
    engines.push(engine);
    const notifier = (patch: Partial<OpenclawNotifierOptions> = {}) => openclaw({
        baseUrl: 'http://openclaw:18789',
        hooksToken: TOKEN,
        deliver: { channel: 'telegram', to: '12345' },
        clock,
        fetch: fake.fetch,
        ...patch,
    });
    return {
        engine,
        store,
        fake,
        notifier,
    };
}

async function run(engine: Engine, store: MemoryStore) {
    await engine.start();
    const { runId } = await engine.dispatch({
        agent: 'reporter',
        trigger: 'http',
        source: 'http',
        payload: {},
    });
    await engine.idle();
    return {
        run: await store.getRun(runId),
        steps: await store.listSteps(runId),
    };
}

function useTool(body: (context: ToolContext) => Promise<unknown>) {
    return defineTool({
        inputSchema: z.object({}),
        execute: async (_input, { context }) => body(context),
    });
}

describe('openclaw context', () => {
    it('a tool sends through the injected notifier', async () => {
        const use = useTool(async (ctx) => {
            await injectOpenclawContext(ctx).notify({
                kind: 'result',
                agent: ctx.run.agent,
                runId: ctx.run.runId,
                title: 'Report ready',
                body: 'All green.',
            }, { idempotencyKey: ctx.run.runId, trigger: ctx.run.trigger });
            return 'sent';
        });
        const {
            engine,
            store,
            fake,
            notifier,
        } = setup(mockModel([callUse, done]), { use });
        provideOpenclawContext(engine, notifier());
        const { run: result } = await run(engine, store);
        expect(result?.status).toBe('completed');
        expect(fake.dispatched).toHaveLength(1);
        expect(fake.dispatched[0]?.message).toContain('Report ready');
    });

    it('two names give two values', async () => {
        const seen: unknown[] = [];
        const use = useTool(async (ctx) => {
            seen.push(injectOpenclawContext(ctx), injectOpenclawContext(ctx, 'ops'));
            return 'ok';
        });
        const {
            engine, 
            store, 
            notifier, 
        } = setup(mockModel([callUse, done]), { use });
        const main = notifier();
        const ops = notifier({ name: 'ops' });
        provideOpenclawContext(engine, main);
        provideOpenclawContext(engine, ops);
        const { run: result } = await run(engine, store);
        expect(result?.status).toBe('completed');
        expect(seen[0]).toBe(main);
        expect(seen[1]).toBe(ops);
    });

    it('an unknown name throws naming openclaw:ops', async () => {
        const use = useTool(async (ctx) => {
            injectOpenclawContext(ctx, 'ops');
            return 'ok';
        });
        const {
            engine, 
            store, 
            notifier, 
        } = setup(mockModel([callUse, done]), { use });
        provideOpenclawContext(engine, notifier());
        const { run: result, steps } = await run(engine, store);
        expect(result?.status).toBe('completed');
        const step = steps.find((s) => s.kind === 'tool' && s.name === 'use');
        const error = step?.error as { code: string; message: string } | undefined;
        expect(error?.code).toBe('context_not_provided');
        expect(error?.message).toContain('"openclaw:ops"');
    });

    it('provide twice under one name throws InvalidAgentDefinitionError', () => {
        const { engine, notifier } = setup(mockModel([]), {});
        provideOpenclawContext(engine, notifier());
        expect(() => provideOpenclawContext(engine, notifier())).toThrow(InvalidAgentDefinitionError);
    });
});
