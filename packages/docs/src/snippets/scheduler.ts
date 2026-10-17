import type { Agent, IStore } from '@chamberu/core';
import { RunEngine } from '@chamberu/core';
import { createScheduler, runJob } from '@chamberu/scheduler';

export async function serve(store: IStore, agents: Agent[], resumeSecret: string) {
    // #region scheduler
    const engine = new RunEngine({
        store,
        agents,
        resumeSecret,
    });
    // every replica runs the same scheduler; a store lock fires each tick once
    const scheduler = createScheduler({
        engine,
        agents,
        store,
        onError: (error, { agent, trigger }) => console.error('[cron]', agent, trigger, error),
    });
    await engine.start();
    await scheduler.start();

    process.once('SIGTERM', async () => {
        // stop scheduling first, then let the runs in flight finish
        await scheduler.stop();
        await engine.drain({ timeoutMs: 25_000 });
        process.exit(0);
    });
    // #endregion scheduler

    return { engine, scheduler };
}

export async function job(store: IStore, agent: Agent, resumeSecret: string) {
    // #region job
    // a Kubernetes CronJob: fire the agent's cron trigger once and exit with its outcome
    const engine = new RunEngine({
        store,
        agents: [agent],
        resumeSecret,
    });
    const { status, exitCode } = await runJob({
        engine,
        store,
        agent,
        drainTimeoutMs: 120_000,
    });
    console.log('cron run', status);
    process.exitCode = exitCode;
    // #endregion job
}
