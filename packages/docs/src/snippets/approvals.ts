import { tool } from 'ai';
import type { LanguageModel } from 'ai';
import { z } from 'zod';
import {
    Engine,
    MemoryStore,
    RunStatus,
    defineAgent,
} from '@chamberu/core';
import type { INotifier, Notification } from '@chamberu/core';

declare function deployVersion(version: string, env: string): Promise<string>;

// #region notifier
class InboxNotifier implements INotifier {
    readonly name = 'owner';

    readonly tokens = new Map<string, string>();

    async notify(n: Notification, opts: { idempotencyKey: string }): Promise<void> {
        // a real notifier sends a message; it must throw when the send fails
        if (n.kind === 'approval' && n.resumeToken) {
            this.tokens.set(opts.idempotencyKey, n.resumeToken);
        }
    }
}
// #endregion notifier

export async function approvalFlow(model: LanguageModel) {
    // #region agent
    const deployer = defineAgent({
        name: 'deployer',
        model,
        instructions: 'Deploy the requested version.',
        tools: {
            deploy: tool({
                description: 'Deploys a version to an environment.',
                inputSchema: z.object({ version: z.string(), env: z.enum(['staging', 'prod']) }),
                execute: async ({ version, env }) => deployVersion(version, env),
            }),
        },
        approvals: {
            // staging deploys run right away, prod deploys wait for the owner
            deploy: (input) => ((input as { env: string }).env === 'prod' ? 'user' : 'allow'),
        },
        approvalTimeoutMs: 60 * 60 * 1000,
        notify: 'owner',
    });
    // #endregion agent

    // #region engine
    const resumeSecret = process.env.RESUME_SECRET;
    if (!resumeSecret) throw new Error('RESUME_SECRET is not set');

    const inbox = new InboxNotifier();
    const engine = new Engine({
        store: new MemoryStore(),
        agents: [deployer],
        notifiers: { owner: inbox },
        resumeSecret,
    });
    // #endregion engine

    await engine.start();
    const { runId } = await engine.dispatch({
        agent: 'deployer',
        trigger: 'http',
        source: 'http',
        payload: { version: '1.4.0', env: 'prod' },
    });
    await engine.idle();

    // #region resume
    const run = await engine.getRun(runId);
    if (run?.status === RunStatus.WAITING && run.waiting) {
        const token = inbox.tokens.get(`${run.id}:${run.waiting.approvalId}`);
        if (token) {
            await engine.resume(token, { approved: false, reason: 'Not on a Friday.' });
        }
    }
    // #endregion resume

    await engine.idle();
    engine.stop();
    return engine.getRun(runId);
}
