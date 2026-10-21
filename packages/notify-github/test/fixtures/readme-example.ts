import type { LanguageModel } from 'ai';
import { Engine, MemoryStore, defineAgent } from '@chamvi/core';
import { createGithubApp, githubWebhook } from '@chamvi/github';
import type { GithubAppOptions } from '@chamvi/github';
import { githubNotifier } from '@chamvi/notify-github';

export function createIssueApprovalEngine(
    model: LanguageModel,
    options: Pick<GithubAppOptions, 'fetch' | 'clock'> = {},
) {
    const {
        GITHUB_APP_ID,
        GITHUB_PRIVATE_KEY,
        GITHUB_WEBHOOK_SECRET,
        GITHUB_OWNER,
        RESUME_SECRET,
        APP_URL,
    } = process.env;
    if (!GITHUB_APP_ID || !GITHUB_PRIVATE_KEY || !GITHUB_WEBHOOK_SECRET || !GITHUB_OWNER || !RESUME_SECRET || !APP_URL) {
        throw new Error('Set GITHUB_APP_ID, GITHUB_PRIVATE_KEY, GITHUB_WEBHOOK_SECRET, GITHUB_OWNER, RESUME_SECRET and APP_URL.');
    }

    const gh = createGithubApp({
        appId: GITHUB_APP_ID,
        privateKey: GITHUB_PRIVATE_KEY,
        webhookSecret: GITHUB_WEBHOOK_SECRET,
        ...options,
    });

    const triage = defineAgent({
        name: 'triage',
        model,
        instructions: 'Close issues that are duplicates.',
        triggers: [githubWebhook({ events: ['issues.opened'] })],
        tools: () => gh.writeTools(),
        // closing waits for the owner, who is asked on the issue itself
        approvals: { github_close_issue: 'user' },
        notify: 'github',
    });

    const engine = new Engine({
        store: new MemoryStore({ clock: options.clock }),
        agents: [triage],
        notifiers: {
            github: githubNotifier({
                app: gh,
                mention: GITHUB_OWNER,
                // a link to the approval in the chamvi UI, without the token
                approvalUrl: ({ runId, approvalId }) => `${APP_URL}/ui/approvals?run=${encodeURIComponent(runId)}&approval=${encodeURIComponent(approvalId)}`,
                clock: options.clock,
            }),
        },
        resumeSecret: RESUME_SECRET,
        clock: options.clock,
    });
    return { engine, gh };
}
