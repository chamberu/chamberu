/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createHttpApp, createShutdown } from '@chamvi/http';
import type { IShutdown } from '@chamvi/http';
import type { IContainer } from 'eldin';
import type { IModule, ModuleDependency } from 'orkos';
import { serve } from 'routup';
import { AppToken, ModuleName } from '../../module/constants.ts';
import { runHooks, throwIfStopped } from '../../module/helpers.ts';
import { registerStartStep } from '../../module/start.ts';
import type { Server } from '../../module/types.ts';
import { resolveAuthenticators } from './helpers.ts';
import type { HttpModuleOptions } from './types.ts';

/**
 * Serves the HTTP app (start mode only). `onReady` builds the graceful
 * shutdown (`SHUTDOWN`) and the routup app from every `AUTHENTICATORS` and
 * `HTTP_ROUTES` contribution, then registers the `serve` start step: the
 * app runs the start steps (engine, scheduler, then this one: the `started`
 * hooks, listening, `SERVER`) only once every module's `onReady` ran, so a
 * configuration error any of them finds starts nothing. `teardown` runs the shutdown: readiness 503, scheduler stop and
 * `stopping` hooks, the app's closers, server close, engine drain.
 */
export class HttpModule implements IModule {
    readonly name: string = ModuleName.HTTP;

    readonly dependencies: (string | ModuleDependency)[] = [
        ModuleName.ENGINE,
        { name: ModuleName.SCHEDULER, optional: true },
        // its onReady may contribute the dev token
        { name: ModuleName.STATIC_TOKENS, optional: true },
    ];

    protected options: HttpModuleOptions;

    protected shutdown: IShutdown | undefined;

    constructor(options: HttpModuleOptions = {}) {
        this.options = options;
    }

    async setup(): Promise<void> {
        // everything happens in onReady, after every module contributed
    }

    async onReady(container: IContainer): Promise<void> {
        const context = container.resolve(AppToken.CONTEXT);
        if (context.mode !== 'start') {
            return;
        }

        const config = container.resolve(AppToken.CONFIG);
        const logger = container.resolve(AppToken.LOGGER);
        const engine = container.resolve(AppToken.ENGINE);
        const scheduler = container.has(AppToken.SCHEDULER) ? container.resolve(AppToken.SCHEDULER) : undefined;

        const auth = resolveAuthenticators(container);

        let server: Server | undefined;
        const shutdown = createShutdown({
            engine,
            // always given, so the stopping hooks (the purge timer) run without a scheduler too
            scheduler: {
                stop: async () => {
                    await scheduler?.stop();
                    await runHooks(container, 'stopping');
                },
            },
            server: { close: (force) => (server ? server.close(force) : Promise.resolve()) },
            readinessDelayMs: config.http.readinessDelayMs,
            drainTimeoutMs: config.http.drainTimeoutMs,
            closeTimeoutMs: config.http.closeTimeoutMs,
            onError: (error) => context.report(error, { phase: 'shutdown' }),
        });
        this.shutdown = shutdown;
        container.register(AppToken.SHUTDOWN, { useValue: shutdown });

        const app = createHttpApp({
            ...this.options,
            engine,
            auth,
            shutdown,
            basePath: config.http.basePath,
            routes: container.resolveAll(AppToken.HTTP_ROUTES),
            ...(container.has(AppToken.AGENT_ISSUES) && { agentIssues: container.resolve(AppToken.AGENT_ISSUES) }),
            onError: (error) => logger.error('http error', error),
        });

        // after the engine and scheduler steps (registered in their onReady, which runs first)
        registerStartStep(container, ModuleName.HTTP, async () => {
            await runHooks(container, 'started');
            throwIfStopped(context);

            server = serve(app, {
                port: config.http.port,
                hostname: config.http.host,
                silent: true,
                gracefulShutdown: false,
            });
            container.register(AppToken.SERVER, { useValue: server });
            await server.ready();

            logger.info('listening', { url: server.url });
            // a stop that arrived while binding tears down at once
            throwIfStopped(context);
        });
    }

    async teardown(): Promise<void> {
        // idempotent; runs with whatever onReady built (nothing to close before the shutdown existed)
        await this.shutdown?.shutdown();
    }
}

export function httpModule(options?: HttpModuleOptions): IModule {
    return new HttpModule(options);
}
