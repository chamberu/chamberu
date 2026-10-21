/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    InvalidAgentDefinitionError,
    MemoryStore,
    defineAgent,
    http,
} from '@chamvi/core';
import type {
    Agent,
    Engine,
    INotifier,
} from '@chamvi/core';
import { ControllableClock } from '@chamvi/test-kit';
import { customProvider, tool } from 'ai';
import type { IContainer } from 'eldin';
import type { IModule } from 'orkos';
import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';
import { z } from 'zod';
import {
    AppToken,
    ModuleName,
    configModule,
    consoleNotifierModule,
    engineModule,
    storeModule,
} from '@chamvi/app';
import type { AppMode, ILifecycleHook } from '@chamvi/app';
import { buildHarness } from '../../../utils/harness.ts';
import type { Harness } from '../../../utils/harness.ts';
import { createRecordingLogger } from '../../../utils/logger.ts';
import { approvalModel, textModel } from '../../../utils/model.ts';

const SECRET = 'x'.repeat(32);

function agentWith(model: Agent['definition']['model'], extra: Partial<Parameters<typeof defineAgent>[0]> = {}): Agent {
    return defineAgent({
        name: 'triage',
        model,
        instructions: 'triage',
        triggers: [http()],
        ...extra,
    });
}

/** A module contributing to a collection token in setup. */
function contributing(name: string, register: (container: IContainer) => void): IModule {
    return {
        name,
        async setup(container) {
            register(container);
        },
    };
}

let harnesses: Harness[] = [];

afterEach(async () => {
    await Promise.all(harnesses.map((h) => h.stop()));
    harnesses = [];
    globalThis.AI_SDK_DEFAULT_PROVIDER = undefined;
});

function build(options: {
    mode?: AppMode;
    agents: Agent[];
    env?: Record<string, string>;
    modules?: IModule[];
    models?: Record<string, ReturnType<typeof customProvider>>;
    store?: MemoryStore;
}) {
    const clock = new ControllableClock(new Date('2026-10-21T00:00:00Z'));
    const logger = createRecordingLogger(clock);
    const harness = buildHarness({
        mode: options.mode,
        env: { RESUME_SECRET: SECRET, ...options.env },
        agents: options.agents,
        models: options.models,
        modules: [
            configModule({ clock, logger }),
            storeModule(options.store ? { store: options.store } : {}),
            engineModule(),
            ...(options.modules ?? []),
        ],
    });
    harnesses.push(harness);
    return {
        harness,
        clock,
        logger,
    };
}

async function dispatch(engine: Engine) {
    return engine.dispatch({
        agent: 'triage',
        trigger: 'http',
        source: 'http',
        payload: {},
    });
}

async function rejectionOf(promise: Promise<unknown>): Promise<Error> {
    try {
        await promise;
    } catch (error) {
        return error as Error;
    }
    throw new Error('expected a rejection');
}

describe('engineModule', () => {
    it('is named and depends on config and store', () => {
        const module = engineModule();
        expect(module.name).toBe(ModuleName.ENGINE);
        expect(module.dependencies).toEqual([ModuleName.CONFIG, ModuleName.STORE]);
    });

    it('start mode builds and starts the engine', async () => {
        const { harness } = build({ agents: [agentWith(textModel('triaged'))] });
        await harness.setup();

        const engine = harness.container.resolve(AppToken.ENGINE);
        const { runId } = await dispatch(engine);
        await engine.idle();

        const run = await engine.getRun(runId);
        expect(run?.status).toBe('completed');
        expect(run?.output).toBe('triaged');
    });

    it('job mode builds but does not start', async () => {
        const { harness } = build({ mode: 'job', agents: [agentWith(textModel())] });
        await harness.setup();

        const engine = harness.container.resolve(AppToken.ENGINE);
        const { runId } = await dispatch(engine);
        await engine.idle();

        expect((await engine.getRun(runId))?.status).toBe('queued');
    });

    it('migrate mode builds nothing', async () => {
        const { harness } = build({
            mode: 'migrate',
            agents: [agentWith('anthropic:m')],
            env: { RESUME_SECRET: '', DATABASE_URL: 'postgres://u@127.0.0.1:1/x' },
            // a given store: the module never connects
            store: new MemoryStore(),
        });
        await harness.setup();

        expect(harness.container.has(AppToken.ENGINE)).toBe(false);
        expect(globalThis.AI_SDK_DEFAULT_PROVIDER).toBeUndefined();
    });

    it('notifiers come from every NOTIFIERS contribution', async () => {
        const agent = agentWith(textModel(), { notify: 'console' });
        const { harness } = build({ agents: [agent], modules: [consoleNotifierModule({ write: () => undefined })] });
        await harness.setup();
        expect(harness.container.has(AppToken.ENGINE)).toBe(true);

        const without = build({ agents: [agent] });
        const error = await rejectionOf(without.harness.setup());
        expect(error).toBeInstanceOf(InvalidAgentDefinitionError);
        expect(error.message).toContain('console');
    });

    it('duplicate notifier names throw', async () => {
        const { harness } = build({
            agents: [agentWith(textModel())],
            modules: [
                consoleNotifierModule({ write: () => undefined }),
                contributing('second', (container) => {
                    container.registerMany(AppToken.NOTIFIERS, {
                        useValue: {
                            name: 'console',
                            notify: async () => undefined,
                        },
                    });
                }),
            ],
        });

        const error = await rejectionOf(harness.setup());
        expect(error).toBeInstanceOf(InvalidAgentDefinitionError);
        expect(error.message).toBe('Two notifiers are named "console".');
    });

    it('engineCreated hooks run before start, drained after drain', async () => {
        const events: string[] = [];
        const hook: ILifecycleHook = {
            name: 'recorder',
            engineCreated: (engine) => {
                events.push(`engineCreated:${engine.listAgents().length}`);
                // the engine is not started yet: a run dispatched here waits for start()
                const original = engine.start.bind(engine);
                engine.start = async () => {
                    events.push('start');
                    await original();
                };
                const drain = engine.drain.bind(engine);
                engine.drain = async (input) => {
                    await drain(input);
                    events.push('drain');
                };
            },
            drained: () => {
                events.push('drained');
            },
        };
        const { harness } = build({
            agents: [agentWith(textModel())],
            modules: [contributing('hooks', (container) => {
                container.registerMany(AppToken.LIFECYCLE_HOOKS, { useValue: hook });
            })],
        });
        await harness.setup();
        expect(events).toEqual(['engineCreated:1', 'start']);

        await harness.stop();
        expect(events).toEqual(['engineCreated:1', 'start', 'drain', 'drained']);
    });

    it('a string model is checked at setup', async () => {
        const agent = agentWith('anthropic:m');
        const { harness } = build({ agents: [agent] });
        const error = await rejectionOf(harness.setup());
        expect(error).toBeInstanceOf(InvalidAgentDefinitionError);
        expect(error.message).toContain('ANTHROPIC_API_KEY');
        expect(globalThis.AI_SDK_DEFAULT_PROVIDER).toBeUndefined();

        const model = textModel('from fake');
        const fake = build({
            agents: [agent],
            models: { anthropic: customProvider({ languageModels: { m: model } }) },
        });
        await fake.harness.setup();

        const engine = fake.harness.container.resolve(AppToken.ENGINE);
        const { runId } = await dispatch(engine);
        await engine.idle();

        expect((await engine.getRun(runId))?.output).toBe('from fake');
        expect(model.doStreamCalls).toHaveLength(1);

        await fake.harness.stop();
        expect(globalThis.AI_SDK_DEFAULT_PROVIDER).toBeUndefined();
    });

    it('a preset global provider skips the checks', async () => {
        const model = textModel('from global');
        const preset = customProvider({ languageModels: { 'anthropic:m': model } });
        globalThis.AI_SDK_DEFAULT_PROVIDER = preset;

        const { harness, logger } = build({ agents: [agentWith('anthropic:m')] });
        await harness.setup();

        expect(logger.entries.some((entry) => entry.level === 'debug' && entry.msg.includes('default provider'))).toBe(true);
        await harness.stop();
        expect(globalThis.AI_SDK_DEFAULT_PROVIDER).toBe(preset);
    });

    it('engine errors go to the logger', async () => {
        const failing: INotifier = {
            name: 'boom',
            notify: async () => {
                throw new Error('notifier down');
            },
        };
        const agent = agentWith(approvalModel('deploy'), {
            tools: {
                deploy: tool({
                    inputSchema: z.object({}),
                    execute: async () => 'deployed',
                }),
            },
            approvals: { deploy: 'user' },
            notify: 'boom',
        });
        const { harness, logger } = build({
            agents: [agent],
            modules: [contributing('chamvi:notifier:boom', (container) => {
                container.registerMany(AppToken.NOTIFIERS, { useValue: failing });
            })],
        });
        await harness.setup();

        const engine = harness.container.resolve(AppToken.ENGINE);
        const { runId } = await dispatch(engine);
        await engine.idle();

        const entry = logger.entries.find((e) => e.level === 'error' && e.msg === 'engine error');
        expect(entry).toMatchObject({ run: runId, agent: 'triage' });
        expect(JSON.stringify(entry)).toContain('notifier down');
    });
});
