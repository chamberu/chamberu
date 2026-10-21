/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError } from '@chamvi/core';
import type { Agent } from '@chamvi/core';
import { runJob } from '@chamvi/scheduler';
import { Container } from 'eldin';
import type { IContainer } from 'eldin';
import { Application } from 'orkos';
import type { IModule } from 'orkos';
import { isObject } from 'smob';
import type { Env } from '../env/types.ts';
import type { ModelProviders } from '../models/types.ts';
import { AppToken } from '../module/constants.ts';
import { createStoppedError, reportingModule } from '../module/helpers.ts';
import type { AppContext, AppMode } from '../module/types.ts';
import { APP_BRAND } from './constants.ts';
import {
    buildModules,
    createInUseError,
    createStopFailedError,
    logReported,
} from './helpers.ts';
import type {
    AppLifecycleOptions,
    AppOptions,
    AppRunJobOptions,
    AppRunJobResult,
    AppStartOptions,
    IApp,
} from './types.ts';

/** One lifecycle: an orkos Application over a fresh container. */
type Lifecycle = {
    controller: AbortController;
    container: IContainer;
    application: Application;
    /** Every error reported during the lifecycle, in order. */
    errors: unknown[];
    /** The lifecycle call in flight (start: the setup; job and migrate: the whole call). */
    done: Promise<unknown>;
};

/**
 * The App createApp returns. Each lifecycle call builds one orkos
 * `Application` over a fresh eldin `Container` with `AppToken.CONTEXT`
 * registered first; an App runs one lifecycle.
 */
export class App implements IApp {
    readonly [APP_BRAND] = true as const;

    readonly agents: readonly Agent[];

    protected modules: IModule[];

    protected models: ModelProviders | undefined;

    protected used = false;

    protected lifecycle: Lifecycle | undefined;

    protected stopping: Promise<void> | undefined;

    constructor(options: AppOptions) {
        if (!isObject(options) || !Array.isArray(options.agents) || options.agents.length === 0) {
            throw new InvalidAgentDefinitionError('createApp needs at least one agent.');
        }

        this.agents = Object.freeze([...options.agents]);
        this.modules = buildModules(options.modules);
        this.models = options.models;
    }

    async start(options: AppStartOptions = {}): Promise<void> {
        const lifecycle = this.begin('start', options, options.dev ?? false);
        lifecycle.done = this.setup(lifecycle);
        await lifecycle.done;
    }

    async runJob(options: AppRunJobOptions): Promise<AppRunJobResult> {
        const lifecycle = this.begin('job', options, false);
        const job = this.job(lifecycle, options);
        lifecycle.done = job;
        return job;
    }

    async migrate(options: AppLifecycleOptions = {}): Promise<void> {
        const lifecycle = this.begin('migrate', options, false);
        lifecycle.done = this.migrateOnce(lifecycle);
        await lifecycle.done;
    }

    stop(): Promise<void> {
        this.stopping ??= this.shutdown();
        return this.stopping;
    }

    protected begin(mode: AppMode, options: AppLifecycleOptions, dev: boolean): Lifecycle {
        if (this.used || this.stopping) {
            throw createInUseError();
        }
        this.used = true;

        const env: Env = options.env ?? process.env;
        const controller = new AbortController();
        const container = new Container();
        const errors: unknown[] = [];
        const report: AppContext['report'] = (error, context) => {
            errors.push(error);
            logReported(container, error, context);
        };

        const context: AppContext = {
            mode,
            dev,
            env,
            signal: controller.signal,
            report,
            models: this.models,
            agents: this.agents,
        };
        container.register(AppToken.CONTEXT, { useValue: context });

        const application = new Application({
            container,
            modules: this.modules.map((module) => reportingModule(module, report)),
        });

        const lifecycle: Lifecycle = {
            controller,
            container,
            application,
            errors,
            done: Promise.resolve(),
        };
        this.lifecycle = lifecycle;
        return lifecycle;
    }

    /**
     * Sets every module up; on a failure (setup or onReady) tears the ready
     * modules down and rethrows, the app_stopped error when stop() interrupted it.
     */
    protected async setup(lifecycle: Lifecycle): Promise<void> {
        const { application, controller } = lifecycle;
        try {
            await application.setup();
        } catch (error) {
            await application.teardown();
            throw controller.signal.aborted ? controller.signal.reason : error;
        }

        if (controller.signal.aborted) {
            // stop() tears down once it saw this lifecycle settle
            throw controller.signal.reason;
        }
    }

    /** Tears every ready module down; throws app_stop_failed when that reported errors. */
    protected async teardown(lifecycle: Lifecycle): Promise<void> {
        const from = lifecycle.errors.length;
        await lifecycle.application.teardown();
        const errors = lifecycle.errors.slice(from);
        if (errors.length > 0) {
            throw createStopFailedError(errors);
        }
    }

    protected async job(lifecycle: Lifecycle, options: AppRunJobOptions): Promise<AppRunJobResult> {
        await this.setup(lifecycle);

        let result: AppRunJobResult;
        try {
            const { container } = lifecycle;
            const engine = container.resolve(AppToken.ENGINE);
            const agent = engine.getAgent(options.agent);
            if (!agent) {
                const names = this.agents.map((a) => a.name).join(', ');
                throw new InvalidAgentDefinitionError(`No agent "${options.agent}"; the app has: ${names}.`);
            }

            const {
                runId, 
                status, 
                exitCode, 
            } = await runJob({
                engine,
                agent,
                trigger: options.trigger,
                drainTimeoutMs: container.resolve(AppToken.CONFIG).http.drainTimeoutMs,
                signal: lifecycle.controller.signal,
            });
            result = {
                ...(runId !== undefined && { runId }),
                status,
                exitCode,
            };
        } catch (error) {
            // the teardown's own errors are logged; the job's error is the answer
            await lifecycle.application.teardown();
            throw error;
        }

        await this.teardown(lifecycle);
        return result;
    }

    protected async migrateOnce(lifecycle: Lifecycle): Promise<void> {
        await this.setup(lifecycle);
        await this.teardown(lifecycle);
    }

    protected async shutdown(): Promise<void> {
        const { lifecycle } = this;
        if (!lifecycle) {
            return;
        }

        const from = lifecycle.errors.length;
        if (!lifecycle.controller.signal.aborted) {
            lifecycle.controller.abort(createStoppedError());
        }

        // never tear down while a module sets up, or a job under runJob's feet
        await lifecycle.done.catch(() => {});
        // a no-op when the lifecycle already tore down
        await lifecycle.application.teardown();

        const errors = lifecycle.errors.slice(from);
        if (errors.length > 0) {
            throw createStopFailedError(errors);
        }
    }
}

/**
 * Builds an app from agents and modules. Synchronous and side-effect free: no
 * env read, no I/O; everything happens in the returned lifecycle methods.
 */
export function createApp(options: AppOptions): IApp {
    return new App(options);
}

/** Whether `value` is an App, also one of another installed copy of the package. */
export function isApp(value: unknown): value is IApp {
    return isObject(value) && (value as Record<PropertyKey, unknown>)[APP_BRAND] === true;
}
