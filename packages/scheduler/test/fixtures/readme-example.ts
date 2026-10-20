import type { LanguageModel } from 'ai';
import {
    MemoryStore,
    RunEngine,
    cron,
    defineAgent,
} from '@chamberu/core';
import { createScheduler } from '@chamberu/scheduler';

export async function startScheduling(model: LanguageModel) {
    const sweep = defineAgent({
        name: 'sweep',
        model,
        instructions: 'Close stale issues older than 30 days.',
        // every 30 minutes, Berlin time; skipped while the previous run is active
        triggers: [cron('*/30 * * * *', { timezone: 'Europe/Berlin' })],
    });

    // MemoryStore is per process; with several replicas, pass one shared store
    // (e.g. TypeormStore) so its lock fires each tick once across them
    const engine = new RunEngine({
        store: new MemoryStore(),
        agents: [sweep],
        resumeSecret: 'change-me',
    });
    // every replica runs the same scheduler; it reads agents and store from the engine
    const scheduler = createScheduler({ engine });

    await engine.start();
    await scheduler.start();

    // shutdown: stop scheduling first, then let the runs in flight finish
    // await scheduler.stop();
    // await engine.drain();
    return { scheduler, engine };
}
