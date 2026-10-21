import { tool } from 'ai';
import type { LanguageModel } from 'ai';
import { z } from 'zod';
import {
    cron,
    defineAgent,
    defineEffectTool,
    webhook,
} from '@chamvi/core';

declare const model: LanguageModel;
declare function addLabel(issue: number, label: string): Promise<void>;
declare function closeIssue(issue: number): Promise<void>;

// #region agent
export const triage = defineAgent({
    name: 'triage',
    model,
    instructions: 'Label new issues and close duplicates.',
    triggers: [
        webhook({ path: '/issues' }),
        cron('0 * * * *'),
    ],
    tools: {
        // recorded per effect key: retries never relabel
        label: defineEffectTool({
            description: 'Adds a label to an issue.',
            inputSchema: z.object({
                issue: z.number(),
                label: z.string(),
            }),
            execute: async (i) => addLabel(i.issue, i.label),
        }),
        close: tool({
            description: 'Closes an issue as a duplicate.',
            inputSchema: z.object({ issue: z.number() }),
            execute: async ({ issue }) => closeIssue(issue),
        }),
    },
    // waits in `waiting` until the owner signs off
    approvals: { close: 'user' },
    notify: 'owner',
});
// #endregion agent
