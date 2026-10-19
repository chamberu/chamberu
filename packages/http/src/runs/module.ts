/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ForbiddenError } from '@ebec/http';
import { RunNotFoundError } from '@chamberu/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { defineCoreHandler } from 'routup';
import type { App, IAppEvent } from 'routup';
import type { HttpContext } from '../app/types.ts';
import { authenticate, authorize } from '../auth/helpers.ts';
import { Permission } from '../auth/constants.ts';
import { agentPermission } from '../auth/module.ts';
import { readJsonBody, validateBody, validatePayload } from '../request/helpers.ts';
import {
    canReadRun,
    createStartRunContainer,
    readIdempotencyHeader,
    requireAgent,
    requireHttpTrigger,
    serializeRun,
} from './helpers.ts';

function param(event: IAppEvent, name: string): string {
    return event.params[name] ?? '';
}

/** `POST /agents/:name/runs`, `GET /runs/:id`, `POST /runs/:id/cancel`. */
export function registerRunRoutes(app: App, ctx: HttpContext): void {
    const startContainer = createStartRunContainer();

    app.post('/agents/:name/runs', defineCoreHandler(async (event) => {
        const name = param(event, 'name');
        await authorize(event, ctx, agentPermission(name, 'run'));
        const trigger = requireHttpTrigger(requireAgent(ctx, name));

        const body = await validateBody(startContainer, await readJsonBody(event, ctx.bodyLimit));
        const idempotencyKey = body.idempotencyKey ?? readIdempotencyHeader(event.request);
        const payload = await validatePayload(trigger.options.schema as StandardSchemaV1 | undefined, body.payload);

        const result = await ctx.engine.dispatch({
            agent: name,
            trigger: trigger.id,
            source: 'http',
            payload,
            ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
            ...(body.thread !== undefined ? { thread: body.thread } : {}),
        });
        event.response.status = 202;
        return result;
    }));

    app.get('/runs/:id', defineCoreHandler(async (event) => {
        const principal = await authenticate(event, ctx);
        const id = param(event, 'id');
        const run = await ctx.store.getRun(id);
        if (!run) throw new RunNotFoundError(id);
        if (!canReadRun(principal, run)) {
            throw new ForbiddenError({ message: `Missing permission "${Permission.RUN_READ}".` });
        }
        return { ...serializeRun(run), steps: await ctx.store.listSteps(id) };
    }));

    app.post('/runs/:id/cancel', defineCoreHandler(async (event) => {
        await authorize(event, ctx, Permission.RUN_CANCEL);
        const id = param(event, 'id');
        await ctx.engine.cancel(id);
        const run = await ctx.engine.getRun(id);
        event.response.status = 202;
        return { runId: id, status: run?.status };
    }));
}
