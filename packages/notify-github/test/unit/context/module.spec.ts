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
import { githubNotifier, injectGithubNotifierContext, provideGithubNotifierContext } from '@chamvi/notify-github';
import type { GithubNotifierOptions } from '@chamvi/notify-github';
import { createGithubFixture } from '../../utils/github.ts';
import { mockModel } from '../../utils/model.ts';
import type { MockResponse } from '../../utils/model.ts';

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
    const {
        clock, 
        fake, 
        gh, 
    } = createGithubFixture({ installationId: 42 });
    const store = new MemoryStore({ clock });
    const engine = new Engine({
        store,
        agents: [defineAgent({
            name: 'release',
            model,
            instructions: 'Release.',
            tools,
        })],
        resumeSecret: 'resume-secret',
        clock,
        onError: () => {},
    });
    engines.push(engine);
    const notifier = (patch: Partial<GithubNotifierOptions> = {}) => githubNotifier({
        app: gh,
        target: { repo: 'octo/demo', number: 7 },
        clock,
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
        agent: 'release',
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

describe('github notifier context', () => {
    it('a tool posts through the injected notifier', async () => {
        const use = useTool(async (ctx) => {
            await injectGithubNotifierContext(ctx).notify({
                kind: 'result',
                agent: ctx.run.agent,
                runId: ctx.run.runId,
                title: 'Release ready',
                body: 'v1.2.3 is out.',
            }, { idempotencyKey: ctx.run.runId, trigger: ctx.run.trigger });
            return 'posted';
        });
        const {
            engine,
            store,
            fake,
            notifier,
        } = setup(mockModel([callUse, done]), { use });
        provideGithubNotifierContext(engine, notifier());
        const { run: result } = await run(engine, store);
        expect(result?.status).toBe('completed');
        const comments = fake.comments.get('octo/demo#7') ?? [];
        expect(comments).toHaveLength(1);
        expect(String(comments[0]?.body)).toContain('Release ready');
    });

    it('two names give two values', async () => {
        const seen: unknown[] = [];
        const use = useTool(async (ctx) => {
            seen.push(injectGithubNotifierContext(ctx), injectGithubNotifierContext(ctx, 'ops'));
            return 'ok';
        });
        const {
            engine, 
            store, 
            notifier, 
        } = setup(mockModel([callUse, done]), { use });
        const main = notifier();
        const ops = notifier({ name: 'ops' });
        provideGithubNotifierContext(engine, main);
        provideGithubNotifierContext(engine, ops);
        const { run: result } = await run(engine, store);
        expect(result?.status).toBe('completed');
        expect(seen[0]).toBe(main);
        expect(seen[1]).toBe(ops);
    });

    it('an unknown name throws naming notify-github:ops', async () => {
        const use = useTool(async (ctx) => {
            injectGithubNotifierContext(ctx, 'ops');
            return 'ok';
        });
        const {
            engine, 
            store, 
            notifier, 
        } = setup(mockModel([callUse, done]), { use });
        provideGithubNotifierContext(engine, notifier());
        const { run: result, steps } = await run(engine, store);
        expect(result?.status).toBe('completed');
        const step = steps.find((s) => s.kind === 'tool' && s.name === 'use');
        const error = step?.error as { code: string; message: string } | undefined;
        expect(error?.code).toBe('context_not_provided');
        expect(error?.message).toContain('"notify-github:ops"');
    });

    it('provide twice under one name throws InvalidAgentDefinitionError', () => {
        const { engine, notifier } = setup(mockModel([]), {});
        provideGithubNotifierContext(engine, notifier());
        expect(() => provideGithubNotifierContext(engine, notifier())).toThrow(InvalidAgentDefinitionError);
    });
});
