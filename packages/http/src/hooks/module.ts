/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { BadRequestError } from '@ebec/http';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { defineCoreHandler } from 'routup';
import type { App } from 'routup';
import type { HttpContext } from '../app/types.ts';
import { authorize } from '../auth/helpers.ts';
import { agentPermission } from '../auth/module.ts';
import { readIdempotencyHeader, readJsonBody, validatePayload } from '../request/helpers.ts';
import { requireWebhookTrigger } from './helpers.ts';

/**
 * `POST /hooks/:agent/:triggerId` (`:triggerId` URL-encoded, e.g.
 * `webhook%3A%2Fissues`): the whole JSON body is the payload; dispatched
 * with source `webhook` and answered `202` without waiting for the run.
 */
export function registerHookRoutes(app: App, ctx: HttpContext): void {
    app.post('/hooks/:agent/:triggerId', defineCoreHandler(async (event) => {
        const agentName = event.params.agent ?? '';
        const triggerId = event.params.triggerId ?? '';
        await authorize(event, ctx, agentPermission(agentName, 'run'));
        const { trigger } = requireWebhookTrigger(ctx, agentName, triggerId);

        const body = await readJsonBody(event, ctx.bodyLimit);
        if (body === undefined) throw new BadRequestError({ message: 'The webhook needs a JSON body.' });
        const payload = await validatePayload(trigger.options.schema as StandardSchemaV1 | undefined, body);

        const idempotencyKey = readIdempotencyHeader(event.request) ?? trigger.idempotencyKey?.(payload);
        const concurrencyKey = trigger.concurrencyKey?.(payload);
        const result = await ctx.engine.dispatch({
            agent: agentName,
            trigger: trigger.id,
            source: 'webhook',
            payload,
            ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
            ...(concurrencyKey !== undefined ? { concurrencyKey } : {}),
        });
        event.response.status = 202;
        return result;
    }));
}
