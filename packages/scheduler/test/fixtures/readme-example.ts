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

    const agents = [sweep];
    const store = new MemoryStore();
    const engine = new RunEngine({
        store,
        agents,
        resumeSecret: 'change-me',
    });
    // every replica runs the same scheduler: a lock in the store fires each tick once
    const scheduler = createScheduler({
        engine,
        agents,
        store,
    });

    await engine.start();
    await scheduler.start();

    // shutdown: stop scheduling first, then let the runs in flight finish
    // await scheduler.stop();
    // await engine.drain();
    return { scheduler, engine };
}
