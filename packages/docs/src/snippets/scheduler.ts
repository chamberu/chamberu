import type { Agent, IStore } from '@chamvi/core';
import { Engine } from '@chamvi/core';
import { createScheduler, runJob } from '@chamvi/scheduler';

export async function serve(store: IStore, agents: Agent[], resumeSecret: string) {
    // #region scheduler
    const engine = new Engine({
        store,
        agents,
        resumeSecret,
    });
    // every replica runs the same scheduler; a store lock fires each tick once
    const scheduler = createScheduler({
        engine,
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
    const engine = new Engine({
        store,
        agents: [agent],
        resumeSecret,
    });
    const { status, exitCode } = await runJob({
        engine,
        agent,
        drainTimeoutMs: 120_000,
    });
    console.log('cron run', status);
    process.exitCode = exitCode;
    // #endregion job
}
