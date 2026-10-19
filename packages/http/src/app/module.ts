/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { NotFoundError } from '@ebec/http';
import { App, defineCoreHandler } from 'routup';
import { registerAgentRoutes } from '../agents/module.ts';
import { registerHealthRoutes } from '../health/module.ts';
import { registerHookRoutes } from '../hooks/module.ts';
import { registerRunRoutes } from '../runs/module.ts';
import { buildContext, createErrorHandler } from './helpers.ts';
import type { HttpAppOptions } from './types.ts';

/**
 * Builds the routup App of a chamberu app: health, REST, webhooks and MCP,
 * one JSON error body for every route under `basePath`.
 */
export function createHttpApp(options: HttpAppOptions): App {
    const ctx = buildContext(options);
    const app = new App({
        path: ctx.basePath || undefined,
        ...(options.trustProxy !== undefined ? { options: { trustProxy: options.trustProxy } } : {}),
    });

    registerHealthRoutes(app, ctx);
    registerAgentRoutes(app, ctx);
    registerRunRoutes(app, ctx);
    registerHookRoutes(app, ctx);

    app.use(defineCoreHandler(() => {
        throw new NotFoundError({ message: 'The requested route does not exist.' });
    }));
    app.use(createErrorHandler(ctx));

    options.shutdown?.onShutdown(() => {
        for (const close of [...ctx.closers]) {
            try {
                close();
            } catch (error) {
                ctx.onError(error);
            }
        }
    });
    return app;
}
