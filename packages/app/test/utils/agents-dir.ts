/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { 
    Engine, 
    MemoryStore, 
    defineAgent, 
    http, 
} from '@chamvi/core';
import type { Agent, IStore } from '@chamvi/core';
import { ControllableClock } from '@chamvi/test-kit';
import { customProvider } from 'ai';
import type { AppMode, IModule  } from '@chamvi/app';
import {
    AgentsModule,
    AppToken,
    configModule,
    engineModule,
    runHooks,
    storeModule,
} from '@chamvi/app';
import { SECRET, hangingModel } from './app.ts';
import { buildHarness } from './harness.ts';
import type { Harness } from './harness.ts';
import { createRecordingLogger } from './logger.ts';
import { mockModel, textModel } from './model.ts';

export const START = new Date('2026-10-22T00:00:00Z');
export const POLL_MS = 1_000;

export function agentFile(instructions: string, model = 'test:model'): string {
    return `export default { model: '${model}', instructions: '${instructions}' };\n`;
}

/** The `test` provider: `test:model` answers 'from folder', `test:hang` never answers. */
export function provider() {
    const answers = Array.from({ length: 20 }, () => ({ parts: [{ type: 'text' as const, text: 'from folder' }] }));
    return customProvider({ languageModels: { model: mockModel(answers), hang: hangingModel() } });
}

export function codeAgent(name: string): Agent {
    return defineAgent({
        name,
        model: textModel('from code'),
        instructions: 'x',
        triggers: [http()],
    });
}

/** A queued run of `name`, dispatched through an engine that never starts. */
export async function queueRun(store: IStore, clock: ControllableClock, name: string): Promise<string> {
    const engine = new Engine({
        store,
        clock,
        resumeSecret: SECRET,
        agents: [codeAgent(name)],
    });
    const { runId } = await engine.dispatch({
        agent: name,
        trigger: 'http',
        source: 'http',
        payload: {},
    });
    return runId;
}

export type AgentsDirHarnessOptions = {
    root: string;
    mode?: AppMode;
    store?: IStore;
    clock?: ControllableClock;
    agents?: Agent[];
    env?: Record<string, string>;
    /** Modules after the agents module (e.g. the scheduler). */
    modules?: IModule[];
};

/** config, store, engine and the agents module (plus `modules`) on a module harness over `root`. */
export function buildAgentsDirHarness(options: AgentsDirHarnessOptions) {
    const clock = options.clock ?? new ControllableClock(START);
    const logger = createRecordingLogger(clock);
    const store = options.store ?? new MemoryStore({ clock });
    const module = new AgentsModule();
    const harness: Harness = buildHarness({
        mode: options.mode,
        env: {
            RESUME_SECRET: SECRET,
            CHAMVI_AGENTS_DIR: options.root,
            CHAMVI_AGENTS_POLL_MS: String(POLL_MS),
            ...options.env,
        },
        agents: options.agents,
        models: { test: provider() },
        modules: [
            configModule({ clock, logger }),
            storeModule({ store }),
            engineModule(),
            module,
            ...options.modules ?? [],
        ],
    });

    return {
        harness,
        clock,
        logger,
        store,
        engine: () => harness.container.resolve(AppToken.ENGINE),
        issues: () => harness.container.resolve(AppToken.AGENT_ISSUES)(),
        /** start mode: runs the `started` hooks (the http module's serve step does in an app). */
        watch: () => runHooks(harness.container, 'started'),
        /** One poll interval, then waits for the poll it started. */
        poll: async () => {
            clock.advance(POLL_MS);
            await module.idle();
        },
    };
}
