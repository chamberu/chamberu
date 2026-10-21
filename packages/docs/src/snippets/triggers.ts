import { readFile } from 'node:fs/promises';
import type { LanguageModel } from 'ai';
import {
    Engine,
    MemoryStore,
    cron,
    defineAgent,
    http,
    webhook,
} from '@chamvi/core';

export async function dispatchExamples(model: LanguageModel) {
    // #region definitions
    const triage = defineAgent({
        name: 'triage',
        model,
        instructions: 'Triage the issue in the trigger payload.',
        triggers: [
            http(), // id 'http'
            webhook({ path: '/issues' }), // id 'webhook:/issues'
            cron('*/30 * * * *', { overlap: 'skip' }), // id 'cron:*/30 * * * *'
        ],
    });
    // #endregion definitions

    const engine = new Engine({
        store: new MemoryStore(),
        agents: [triage],
        resumeSecret: 'change-me',
    });

    // #region dispatch
    const first = await engine.dispatch({
        agent: 'triage',
        trigger: 'webhook:/issues',
        source: 'webhook',
        payload: { repo: 'acme/app', issue: 42 },
        // a redelivery with the same key returns the same run
        idempotencyKey: 'delivery-7f3a',
        // one run at a time per issue
        concurrencyKey: 'acme/app#42',
    });

    const again = await engine.dispatch({
        agent: 'triage',
        trigger: 'webhook:/issues',
        source: 'webhook',
        payload: { repo: 'acme/app', issue: 42 },
        idempotencyKey: 'delivery-7f3a',
    });

    again.runId === first.runId; // true
    again.deduplicated; // true
    // #endregion dispatch

    // #region attachments
    const withFile = await engine.dispatch({
        agent: 'triage',
        trigger: 'http',
        source: 'http',
        payload: { repo: 'acme/app', issue: 43 },
        // stored as artifacts of the run; the model gets them as file parts
        attachments: [{
            mediaType: 'image/png',
            filename: 'crash.png',
            data: new Uint8Array(await readFile('crash.png')),
        }],
    });

    const run = await engine.getRun(withFile.runId);
    run?.trigger.attachments; // [{ id, runId, agent, mediaType: 'image/png', filename: 'crash.png', size, createdAt }]
    // #endregion attachments

    return { first, again };
}
