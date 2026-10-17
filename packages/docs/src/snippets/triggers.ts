import type { LanguageModel } from 'ai';
import {
    MemoryStore,
    RunEngine,
    cron,
    defineAgent,
    http,
    manual,
} from '@chamberu/core';

export async function dispatchExamples(model: LanguageModel) {
    // #region definitions
    const triage = defineAgent({
        name: 'triage',
        model,
        instructions: 'Triage the issue in the trigger payload.',
        triggers: [
            manual(), // id 'manual'
            http({ path: '/issues' }), // id 'http:/issues'
            cron('*/30 * * * *', { overlap: 'skip' }), // id 'cron:*/30 * * * *'
        ],
    });
    // #endregion definitions

    const engine = new RunEngine({
        store: new MemoryStore(),
        agents: [triage],
        resumeSecret: 'change-me',
    });

    // #region dispatch
    const first = await engine.dispatch({
        agent: 'triage',
        trigger: 'http:/issues',
        source: 'http',
        payload: { repo: 'acme/app', issue: 42 },
        // a redelivery with the same key returns the same run
        idempotencyKey: 'delivery-7f3a',
        // one run at a time per issue
        concurrencyKey: 'acme/app#42',
    });

    const again = await engine.dispatch({
        agent: 'triage',
        trigger: 'http:/issues',
        source: 'http',
        payload: { repo: 'acme/app', issue: 42 },
        idempotencyKey: 'delivery-7f3a',
    });

    again.runId === first.runId; // true
    again.deduplicated; // true
    // #endregion dispatch

    return { first, again };
}
