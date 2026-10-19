/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Agent, TriggerDefinition } from '@chamberu/core';
import { NotFoundError } from '@ebec/http';
import type { HttpContext } from '../app/types.ts';

/** The agent's `webhook()` trigger with this id, else 404. */
export function requireWebhookTrigger(ctx: HttpContext, agentName: string, triggerId: string): { agent: Agent; trigger: TriggerDefinition } {
    const agent = ctx.agents.get(agentName);
    const trigger = agent?.definition.triggers?.find((t) => t.id === triggerId && t.source === 'webhook');
    if (!agent || !trigger) {
        throw new NotFoundError({ message: `No webhook trigger "${triggerId}" on agent "${agentName}".` });
    }
    return { agent, trigger };
}
