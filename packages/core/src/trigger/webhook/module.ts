/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError } from '../../errors/index.ts';
import type { TriggerDefinition } from '../types.ts';
import type { WebhookTriggerOptions } from './types.ts';

/**
 * A generic webhook (envelope `source: 'webhook'`), id `webhook:<path>`; an
 * agent may declare many. Served by `@chamberu/http` at
 * `POST /hooks/:agent/:triggerId`.
 */
export function webhook(opts: WebhookTriggerOptions): TriggerDefinition {
    if (typeof opts.path !== 'string' || !opts.path.startsWith('/')) {
        throw new InvalidAgentDefinitionError(`Webhook path "${String(opts.path)}" must start with "/".`);
    }

    const definition: TriggerDefinition = {
        source: 'webhook',
        id: `webhook:${opts.path}`,
        options: { path: opts.path, schema: opts.schema },
    };
    if (opts.idempotencyKey) definition.idempotencyKey = opts.idempotencyKey;
    if (opts.concurrencyKey) definition.concurrencyKey = opts.concurrencyKey;
    return definition;
}
