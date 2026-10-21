/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError } from '@chamvi/core';
import type { Engine } from '@chamvi/core';
import { DEFAULT_SANDBOX_IMAGE, createWorkspaceManager } from '@chamvi/sandbox';
import type { ISandboxProvider, IWorkspaceManager } from '@chamvi/sandbox';
import type { IContainer } from 'eldin';
import type { IModule } from 'orkos';
import { isObject } from 'smob';
import { envOneOf, envString } from '../env/module.ts';
import { AppToken } from '../module/constants.ts';
import type { AppContext } from '../module/types.ts';
import {
    SANDBOX_MODULE_NAME,
    SANDBOX_PROVIDER_IDS,
    SANDBOX_PROVIDER_NAMES,
    SANDBOX_PROVIDER_PACKAGES,
} from './constants.ts';
import { createLazyProvider } from './provider.ts';
import type { LazyProvider } from './provider.ts';
import type { SandboxModuleOptions, SandboxProviderName } from './types.ts';

/**
 * Run-scoped workspaces (`.manager`, built when the factory is called). In
 * start and job mode `setup` loads the provider package and contributes the
 * lifecycle hook that attaches the manager to the engine and closes it after
 * the engine drained; migrate mode does nothing.
 */
export class SandboxModule implements IModule {
    readonly name: string = SANDBOX_MODULE_NAME;

    readonly manager: IWorkspaceManager;

    protected lazy: LazyProvider | undefined;

    protected report: AppContext['report'] | undefined;

    constructor(options: SandboxModuleOptions = {}) {
        const {
            provider,
            manager,
            namespace,
            image,
            workspaceEnv,
            env: input,
            ...managerOptions
        } = options;

        if (manager) {
            this.manager = manager;
            return;
        }

        const env = input ?? process.env;
        const name = envOneOf(env, 'CHAMVI_SANDBOX_PROVIDER', SANDBOX_PROVIDER_NAMES) ??
            (typeof provider === 'string' ? provider : undefined);

        let target: ISandboxProvider;
        if (typeof name === 'undefined' && isObject(provider)) {
            target = provider;
        } else {
            const selected = name ?? 'local';
            const resolved = {
                image: envString(env, 'CHAMVI_SANDBOX_IMAGE') ?? image ?? DEFAULT_SANDBOX_IMAGE,
                namespace: envString(env, 'CHAMVI_SANDBOX_NAMESPACE') ?? namespace,
            };
            if (selected === 'kubernetes' && !resolved.namespace) {
                throw new InvalidAgentDefinitionError('CHAMVI_SANDBOX_NAMESPACE is required for CHAMVI_SANDBOX_PROVIDER=kubernetes.');
            }
            this.lazy = createLazyProvider(
                SANDBOX_PROVIDER_IDS[selected],
                () => this.loadProvider(selected, resolved),
            );
            target = this.lazy;
        }

        this.manager = createWorkspaceManager({
            ...managerOptions,
            provider: target,
            ...(workspaceEnv && { env: workspaceEnv }),
            onError: managerOptions.onError ?? ((error) => this.reportError(error)),
        });
    }

    async setup(container: IContainer): Promise<void> {
        const context = container.resolve(AppToken.CONTEXT);
        if (context.mode === 'migrate') {
            return;
        }

        this.report = context.report;
        await this.lazy?.load();

        let detach: (() => void) | undefined;
        container.registerMany(AppToken.LIFECYCLE_HOOKS, {
            useValue: {
                name: SANDBOX_MODULE_NAME,
                engineCreated: (engine: Engine) => {
                    detach = this.manager.attach(engine);
                },
                drained: async () => {
                    detach?.();
                    detach = undefined;
                    await this.manager.close();
                },
            },
        });
    }

    /** Imports the provider package and builds the provider; a test seam. */
    protected async importProvider(
        name: SandboxProviderName,
        options: { image: string; namespace?: string },
    ): Promise<ISandboxProvider> {
        switch (name) {
            case 'docker': {
                const { createDockerSandbox } = await import('@chamvi/sandbox-docker');
                return createDockerSandbox({ image: options.image });
            }
            case 'kubernetes': {
                const { createKubernetesSandbox } = await import('@chamvi/sandbox-k8s');
                return createKubernetesSandbox({ namespace: options.namespace!, image: options.image });
            }
            default: {
                const { createLocalSandbox } = await import('@chamvi/sandbox-local');
                return createLocalSandbox();
            }
        }
    }

    protected async loadProvider(
        name: SandboxProviderName,
        options: { image: string; namespace?: string },
    ): Promise<ISandboxProvider> {
        try {
            return await this.importProvider(name, options);
        } catch (error) {
            if (isObject(error) && error.code === 'ERR_MODULE_NOT_FOUND') {
                throw new InvalidAgentDefinitionError(`CHAMVI_SANDBOX_PROVIDER=${name} needs ${SANDBOX_PROVIDER_PACKAGES[name]} installed.`);
            }
            throw error;
        }
    }

    protected reportError(error: unknown): void {
        if (this.report) {
            this.report(error, { module: SANDBOX_MODULE_NAME });
            return;
        }
        // eslint-disable-next-line no-console
        console.error('[chamvi]', error);
    }
}

/**
 * The sandbox module. The provider is `CHAMVI_SANDBOX_PROVIDER` (`local`,
 * `docker`, `kubernetes`), else `options.provider`, else `local`, read from
 * `options.env ?? process.env` now; its package is imported in `setup`.
 */
export function sandboxModule(options?: SandboxModuleOptions): SandboxModule {
    return new SandboxModule(options);
}
