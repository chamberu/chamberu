import type { LanguageModel } from 'ai';
import {
    Engine,
    MemoryStore,
    consoleChannel,
    defineAgent,
} from '@chamvi/core';

export function createEngine(model: LanguageModel) {
    // #region many
    const triage = defineAgent({
        name: 'triage',
        model,
        instructions: 'Triage the issue.',
    });
    const digest = defineAgent({
        name: 'digest',
        model,
        instructions: 'Summarize the day.',
    });

    const engine = new Engine({
        store: new MemoryStore(),
        agents: [triage, digest],
        // tools reach it with injectChannel(ctx, 'console')
        channels: [consoleChannel()],
        resumeSecret: 'change-me',
        maxConcurrentRuns: 8,
        claimTtlMs: 30_000,
    });
    // #endregion many

    return engine;
}
