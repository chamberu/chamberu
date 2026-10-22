/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Engine } from '@chamvi/core';
import type { IContainer } from 'eldin';
import type { IModule } from 'orkos';
import { installDefaultProvider, resolveModels } from '../../models/module.ts';
import { AppToken, ModuleName } from '../../module/constants.ts';
import { runHooks } from '../../module/helpers.ts';
import { registerStartStep } from '../../module/start.ts';
import type { EngineModuleOptions } from './types.ts';

/**
 * Builds the `Engine` (start and job mode; nothing in migrate mode). `setup`
 * checks every string model against the provider registry, installs it as
 * the AI SDK default provider, unless one is set already, and registers that
 * check as `MODEL_CHECK` (a no-op with a preset provider); `onReady` builds the
 * engine with every `CHANNELS` contribution (two of one name, or a
 * subscription of a channel nobody contributed, is InvalidAgentDefinitionError),
 * registers `ENGINE`, runs the `engineCreated` hooks and, in start mode,
 * registers its start step (run once every module's `onReady` checked its
 * configuration): `engine.start()`, which starts the channels; a job starts
 * the engine without them. `teardown` drains it (which stops the channels
 * first) and runs the `drained` hooks.
 */
export class EngineModule implements IModule {
    readonly name: string = ModuleName.ENGINE;

    readonly dependencies = [ModuleName.CONFIG, ModuleName.STORE];

    protected options: EngineModuleOptions;

    protected engine: Engine | undefined;

    protected restore: (() => void) | undefined;

    constructor(options: EngineModuleOptions = {}) {
        this.options = options;
    }

    async setup(container: IContainer): Promise<void> {
        const context = container.resolve(AppToken.CONTEXT);
        if (context.mode === 'migrate') {
            return;
        }

        if (globalThis.AI_SDK_DEFAULT_PROVIDER !== undefined) {
            container.resolve(AppToken.LOGGER).debug('a default provider is set; chamvi leaves model strings to it');
            container.register(AppToken.MODEL_CHECK, { useValue: () => undefined });
            return;
        }

        const { registry, check } = await resolveModels({
            agents: context.agents,
            env: context.env,
            models: context.models,
        });
        container.register(AppToken.MODEL_CHECK, { useValue: check });
        this.restore = installDefaultProvider(registry);
    }

    async onReady(container: IContainer): Promise<void> {
        const context = container.resolve(AppToken.CONTEXT);
        if (context.mode === 'migrate') {
            return;
        }

        const config = container.resolve(AppToken.CONFIG);
        const logger = container.resolve(AppToken.LOGGER);

        const engine = new Engine({
            store: container.resolve(AppToken.STORE),
            agents: [...context.agents],
            channels: container.resolveAll(AppToken.CHANNELS),
            resumeSecret: config.engine.resumeSecret,
            maxConcurrentRuns: config.engine.maxConcurrentRuns,
            clock: container.resolve(AppToken.CLOCK),
            ...(this.options.owner !== undefined && { owner: this.options.owner }),
            ...(this.options.claimTtlMs !== undefined && { claimTtlMs: this.options.claimTtlMs }),
            onError: (error, run) => logger.error('engine error', error, { run: run?.id, agent: run?.agent }),
        });
        this.engine = engine;
        container.register(AppToken.ENGINE, { useValue: engine });

        await runHooks(container, 'engineCreated', engine);

        if (context.mode === 'start') {
            // started once every onReady checked its configuration (authenticators, routes); starts the channels
            registerStartStep(container, ModuleName.ENGINE, () => engine.start());
        }
    }

    async teardown(container: IContainer): Promise<void> {
        const { engine, restore } = this;
        this.engine = undefined;
        this.restore = undefined;

        try {
            if (engine) {
                // a no-op once createShutdown or runJob drained it
                await engine.drain({ timeoutMs: container.resolve(AppToken.CONFIG).http.drainTimeoutMs });
                await runHooks(container, 'drained');
            }
        } finally {
            restore?.();
        }
    }
}

export function engineModule(options?: EngineModuleOptions): IModule {
    return new EngineModule(options);
}
