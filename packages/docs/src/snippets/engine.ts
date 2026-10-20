import type { LanguageModel } from 'ai';
import {
    Engine,
    MemoryStore,
    defineAgent,
} from '@chamberu/core';
import { ConsoleNotifier } from './notifiers.ts';

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
        notify: 'console',
    });

    const engine = new Engine({
        store: new MemoryStore(),
        agents: [triage, digest],
        notifiers: { console: new ConsoleNotifier() },
        resumeSecret: 'change-me',
        maxConcurrentRuns: 8,
        claimTtlMs: 30_000,
    });
    // #endregion many

    return engine;
}
