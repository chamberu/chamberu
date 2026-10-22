/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { resolve } from 'node:path';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import type { IContainer } from 'eldin';
import type { IModule } from 'orkos';
import { AppToken, ModuleName } from '../../module/constants.ts';
import { AGENTS_WATCHER_HOOK_NAME, NO_AGENTS_MESSAGE, NO_DIRECTORY_MESSAGE } from './constants.ts';
import { isDirectory } from './helpers.ts';
import type { IAgentsWatcher } from './types.ts';
import { createAgentsWatcher } from './watcher.ts';

/**
 * The agents dir (`CHAMVI_AGENTS_DIR`, start and job mode; nothing in
 * migrate mode). Without a dir it only refuses an app without code agents.
 * With one, `setup` registers `AGENT_ISSUES` and (start mode) the watcher's
 * lifecycle hook; `onReady` loads every folder into the engine before any
 * start step runs (a folder changed while the app was down cancels its old
 * runs once, a marker without a folder removes that agent), and the watcher
 * polls every `CHAMVI_AGENTS_POLL_MS` from `started` until `stopping` or
 * `teardown`, awaiting a reload in flight.
 */
export class AgentsModule implements IModule {
    readonly name: string = ModuleName.AGENTS;

    readonly dependencies = [ModuleName.CONFIG, ModuleName.ENGINE];

    protected watcher: IAgentsWatcher | undefined;

    async setup(container: IContainer): Promise<void> {
        const context = container.resolve(AppToken.CONTEXT);
        if (context.mode === 'migrate') {
            return;
        }

        const { dir } = container.resolve(AppToken.CONFIG).agents;
        if (dir === undefined) {
            if (context.agents.length === 0) {
                throw new InvalidAgentDefinitionError(NO_AGENTS_MESSAGE);
            }
            return;
        }

        container.register(AppToken.AGENT_ISSUES, { useValue: () => this.watcher?.issues() ?? [] });
        if (context.mode === 'start') {
            container.registerMany(AppToken.LIFECYCLE_HOOKS, {
                useValue: {
                    name: AGENTS_WATCHER_HOOK_NAME,
                    started: () => this.watcher?.start(),
                    stopping: () => this.watcher?.stop(),
                },
            });
        }
    }

    async onReady(container: IContainer): Promise<void> {
        const context = container.resolve(AppToken.CONTEXT);
        const config = container.resolve(AppToken.CONFIG);
        const { dir } = config.agents;
        if (context.mode === 'migrate' || dir === undefined) {
            return;
        }

        const root = resolve(process.cwd(), dir);
        if (!await isDirectory(root)) {
            throw new InvalidAgentDefinitionError(NO_DIRECTORY_MESSAGE);
        }

        const watcher = createAgentsWatcher({
            root,
            engine: container.resolve(AppToken.ENGINE),
            codeNames: new Set(context.agents.map((agent) => agent.name)),
            check: container.has(AppToken.MODEL_CHECK) ? container.resolve(AppToken.MODEL_CHECK) : () => undefined,
            clock: container.resolve(AppToken.CLOCK),
            logger: container.resolve(AppToken.LOGGER),
            pollMs: config.agents.pollMs,
            signal: context.signal,
        });
        this.watcher = watcher;
        await watcher.boot();
    }

    /** Resolves once the watcher's poll in flight, if any, settled. */
    async idle(): Promise<void> {
        await this.watcher?.idle();
    }

    async teardown(): Promise<void> {
        // idempotent; the issues stay readable
        await this.watcher?.stop();
    }
}

export function agentsModule(): IModule {
    return new AgentsModule();
}
