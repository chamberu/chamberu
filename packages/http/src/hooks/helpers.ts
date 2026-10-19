/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Agent, TriggerDefinition } from '@chamberu/core';
import { NotFoundError } from '@ebec/http';
import type { HttpContext } from '../app/types.ts';

/** The agent's `webhook()` trigger declared with this `path`, else 404. */
export function requireWebhookTrigger(ctx: HttpContext, agentName: string, path: string): { agent: Agent; trigger: TriggerDefinition } {
    const agent = ctx.agents.get(agentName);
    const trigger = agent?.definition.triggers?.find((t) => t.source === 'webhook' && t.options.path === path);
    if (!agent || !trigger) {
        throw new NotFoundError({ message: `No webhook "${path}" on agent "${agentName}".` });
    }
    return { agent, trigger };
}

/** Where a webhook with this `path` is served, each segment URL-encoded. */
export function webhookUrl(basePath: string, agentName: string, path: string): string {
    const encoded = path.split('/').map((segment) => encodeURIComponent(segment)).join('/');
    return `${basePath}/hooks/${agentName}${encoded === '/' ? '' : encoded}`;
}
