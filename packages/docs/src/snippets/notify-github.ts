import { Engine, MemoryStore, defineAgent } from '@chamvi/core';
import type { LanguageModel } from 'ai';
import { createGithubApp, githubWebhook } from '@chamvi/github';
import { githubNotifier } from '@chamvi/notify-github';

export function createTriage(model: LanguageModel) {
    // #region notifier
    const gh = createGithubApp({
        appId: process.env.GITHUB_APP_ID ?? '',
        privateKey: process.env.GITHUB_PRIVATE_KEY ?? '',
        webhookSecret: process.env.GITHUB_WEBHOOK_SECRET ?? '',
        slug: 'octo-triage',
    });

    const triage = defineAgent({
        name: 'triage',
        model,
        instructions: 'Close duplicate issues.',
        triggers: [githubWebhook({ events: ['issues.opened'] })],
        tools: () => gh.writeTools(),
        approvals: { github_close_issue: 'user' },
        // the approval request becomes a comment on the run's issue
        notify: 'github',
    });

    const engine = new Engine({
        store: new MemoryStore(),
        agents: [triage],
        notifiers: {
            github: githubNotifier({
                app: gh,
                // mentioned at the top of every comment
                mention: 'octocat',
                // for runs not started by an issue or pull request event
                target: { repo: 'octo/ops', number: 1 },
            }),
        },
        resumeSecret: process.env.RESUME_SECRET ?? '',
    });
    // #endregion notifier
    return engine;
}
