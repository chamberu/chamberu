import type { LanguageModel } from 'ai';
import { z } from 'zod';
import {
    Engine,
    MemoryStore,
    defineAgent,
    defineEffectTool,
    http,
} from '@chamberu/core';

export async function triageIssue(model: LanguageModel) {
    const labels: string[] = [];

    const triage = defineAgent({
        name: 'triage',
        model,
        instructions: 'Label the issue in the trigger payload as bug, feature or question.',
        triggers: [http()],
        budget: { maxSteps: 5 },
        tools: {
            // the result is recorded per (run, tool, input): a resumed run reuses it
            addLabel: defineEffectTool({
                description: 'Adds a label to the issue.',
                inputSchema: z.object({ label: z.enum(['bug', 'feature', 'question']) }),
                execute: async ({ label }) => {
                    labels.push(label);
                    return { added: label };
                },
            }),
        },
    });

    const engine = new Engine({
        store: new MemoryStore(),
        agents: [triage],
        resumeSecret: 'change-me',
    });
    await engine.start();

    const { runId } = await engine.dispatch({
        agent: 'triage',
        trigger: 'http',
        source: 'http',
        payload: { title: 'App crashes on start' },
    });

    await engine.idle();
    engine.stop();

    return { run: await engine.getRun(runId), labels };
}
