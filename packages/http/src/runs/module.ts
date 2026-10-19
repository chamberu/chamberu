/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Run } from '@chamberu/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { defineCoreHandler } from 'routup';
import type { App, IAppEvent } from 'routup';
import { requireAgent } from '../agents/helpers.ts';
import type { HttpContext } from '../app/types.ts';
import { authenticate, authorize } from '../auth/helpers.ts';
import { Permission } from '../auth/constants.ts';
import { agentPermission } from '../auth/module.ts';
import {
    readIdempotencyHeader,
    readJsonBody,
    validateBody,
    validatePayload,
} from '../request/helpers.ts';
import {
    assertCanListRuns,
    createResumeContainer,
    createStartRunContainer,
    loadReadableRun,
    parseRunListQuery,
    requireHttpTrigger,
    resolveResumeTarget,
    serializeRun,
} from './helpers.ts';
import { streamRun } from './stream/module.ts';

function param(event: IAppEvent, name: string): string {
    return event.params[name] ?? '';
}

/** The run, once the principal may read it: 401, then 404, then 403. */
async function readableRun(event: IAppEvent, ctx: HttpContext, id: string): Promise<Run> {
    return loadReadableRun(ctx, await authenticate(event, ctx), id);
}

/** `POST /agents/:name/runs`, `GET /runs`, `GET /runs/:id`, `GET /runs/:id/stream`, `POST /runs/:id/cancel`, `POST /resume`. */
export function registerRunRoutes(app: App, ctx: HttpContext): void {
    const startContainer = createStartRunContainer();
    const resumeContainer = createResumeContainer();

    app.post('/agents/:name/runs', defineCoreHandler(async (event) => {
        const name = param(event, 'name');
        await authorize(event, ctx, agentPermission(name, 'run'));
        const trigger = requireHttpTrigger(requireAgent(ctx.agents, name));

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

    app.get('/runs', defineCoreHandler(async (event) => {
        const principal = await authenticate(event, ctx);
        const query = parseRunListQuery(event.searchParams, ctx.agents.keys());
        assertCanListRuns(principal, query.agent);

        const { data, total } = await ctx.store.listRuns(query);
        return {
            data: data.map(serializeRun),
            meta: {
                total,
                limit: query.limit,
                offset: query.offset,
            },
        };
    }));

    app.get('/runs/:id', defineCoreHandler(async (event) => {
        const run = await readableRun(event, ctx, param(event, 'id'));
        return { ...serializeRun(run), steps: await ctx.store.listSteps(run.id) };
    }));

    app.get('/runs/:id/stream', defineCoreHandler(async (event) => {
        const run = await readableRun(event, ctx, param(event, 'id'));
        return streamRun(event, ctx, run.id);
    }));

    app.post('/runs/:id/cancel', defineCoreHandler(async (event) => {
        await authorize(event, ctx, Permission.RUN_CANCEL);
        const id = param(event, 'id');
        await ctx.engine.cancel(id);
        const run = await ctx.engine.getRun(id);
        event.response.status = 202;
        return { runId: id, status: run?.status };
    }));

    app.post('/resume', defineCoreHandler(async (event) => {
        // the permission depends on the token: authenticate before reading the body
        const principal = await authenticate(event, ctx);
        const body = await validateBody(resumeContainer, await readJsonBody(event, ctx.bodyLimit), { required: true });
        const run = await resolveResumeTarget(ctx, principal, body.token);
        await ctx.engine.resume(body.token, {
            approved: body.approved,
            ...(body.reason !== undefined ? { reason: body.reason } : {}),
        });
        event.response.status = 202;
        return { runId: run.id, status: 'queued' };
    }));
}
