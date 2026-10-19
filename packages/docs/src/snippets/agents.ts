import { Output, tool } from 'ai';
import type { LanguageModel } from 'ai';
import { z } from 'zod';
import {
    cron,
    defineAgent,
    defineEffectTool,
    http,
} from '@chamberu/core';

declare function renderChart(points: number[]): Promise<Uint8Array>;

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

export function createLabeler(model: LanguageModel) {
    // #region output
    const labeler = defineAgent({
        name: 'labeler',
        model,
        instructions: 'Label the issue in the trigger payload.',
        triggers: [http()],
        // run.output is { label, reason } instead of the final text
        output: Output.object({
            schema: z.object({
                label: z.enum(['bug', 'feature', 'question']),
                reason: z.string(),
            }),
        }),
    });
    // #endregion output

    return labeler;
}

export function createCharter(model: LanguageModel) {
    // #region artifacts
    const charter = defineAgent({
        name: 'charter',
        model,
        instructions: 'Chart the numbers in the attached CSV.',
        triggers: [http()],
        tools: ({ artifacts }) => ({
            // an effect tool: a recovered run does not store the chart twice
            saveChart: defineEffectTool({
                description: 'Renders the points as a PNG chart and stores it with the run.',
                inputSchema: z.object({ points: z.array(z.number()) }),
                execute: async ({ points }) => {
                    const artifact = await artifacts.put({
                        mediaType: 'image/png',
                        filename: 'chart.png',
                        data: await renderChart(points),
                    });
                    return { artifactId: artifact.id };
                },
            }),
        }),
    });
    // #endregion artifacts

    return charter;
}
