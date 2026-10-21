/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { defineAgent, http, webhook } from '@chamvi/core';
import type { Agent } from '@chamvi/core';
import { textModel } from './model.ts';

/** `echo` (http only) and `intake` (a webhook, an approval, an `issues` collection). */
export function inventoryAgents(): Agent[] {
    return [
        defineAgent({
            name: 'echo',
            model: textModel(),
            instructions: 'Echo.',
            triggers: [http()],
        }),
        defineAgent({
            name: 'intake',
            model: textModel(),
            instructions: 'Intake.',
            triggers: [webhook({ path: '/issues' })],
            tools: () => ({ deploy: tool({ inputSchema: z.object({}), execute: async () => 'ok' }) }),
            approvals: { deploy: 'user' },
            state: { issues: z.object({ title: z.string(), status: z.string() }) },
        }),
    ];
}
