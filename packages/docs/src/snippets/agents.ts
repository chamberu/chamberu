import { tool } from 'ai';
import type { LanguageModel } from 'ai';
import { z } from 'zod';
import {
    cron,
    defineAgent,
    http,
} from '@chamberu/core';

export function createReporter(model: LanguageModel) {
    // #region define
    const reporter = defineAgent({
        name: 'weekly-report',
        model,
        instructions: 'Summarize the open work items in the trigger payload.',
        triggers: [
            http(),
            cron('0 8 * * 1', { timezone: 'Europe/Berlin' }),
        ],
        budget: {
            maxSteps: 10,
            maxTokens: 50_000,
            timeoutMs: 5 * 60 * 1000,
        },
        tools: ({ run, state }) => ({
            lastReport: tool({
                description: 'Returns the date of the previous report.',
                inputSchema: z.object({}),
                execute: async () => (await state.get<string>('lastReport')) ?? 'never',
            }),
            saveReport: tool({
                description: 'Remembers that a report was written now.',
                inputSchema: z.object({}),
                execute: async () => {
                    await state.set('lastReport', run.trigger.receivedAt.toISOString());
                    return { saved: true };
                },
            }),
        }),
    });
    // #endregion define

    return reporter;
}

export function inspectDefaults(model: LanguageModel) {
    // #region defaults
    const agent = defineAgent({
        name: 'echo',
        model,
        instructions: 'Repeat the payload.',
    });

    agent.name; // 'echo'
    agent.definition.budget; // { maxSteps: 20, timeoutMs: 900_000 }
    // #endregion defaults

    return agent;
}
