import type { LanguageModel } from 'ai';
import { Engine, MemoryStore, defineAgent } from '@chamvi/core';
import { createGithubApp, githubWebhook } from '@chamvi/github';
import type { GithubAppOptions } from '@chamvi/github';
import { createHttpApp, createShutdown, staticTokens } from '@chamvi/http';

export async function createTriageServer(
    model: LanguageModel,
    options: Pick<GithubAppOptions, 'fetch' | 'clock'> = {},
) {
    const {
        GITHUB_APP_ID,
        GITHUB_PRIVATE_KEY,
        GITHUB_WEBHOOK_SECRET,
        CHAMVI_TOKEN,
        RESUME_SECRET,
    } = process.env;
    if (!GITHUB_APP_ID || !GITHUB_PRIVATE_KEY || !GITHUB_WEBHOOK_SECRET || !CHAMVI_TOKEN || !RESUME_SECRET) {
        throw new Error('Set GITHUB_APP_ID, GITHUB_PRIVATE_KEY, GITHUB_WEBHOOK_SECRET, CHAMVI_TOKEN and RESUME_SECRET.');
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
        instructions: 'Label new issues and thank the author in one comment.',
        // one run per issues.opened delivery, deduplicated by the delivery id
        triggers: [githubWebhook({ events: ['issues.opened'] })],
        tools: () => ({ ...gh.readTools(), ...gh.writeTools() }),
        approvals: { github_close_issue: 'user' },
    });

    const engine = new Engine({
        store: new MemoryStore(),
        agents: [triage],
        resumeSecret: RESUME_SECRET,
    });

    const shutdown = createShutdown({ engine });
    const app = createHttpApp({
        // the webhook route dispatches to the engine's agents
        engine,
        auth: staticTokens({
            tokens: [{
                value: CHAMVI_TOKEN,
                id: 'ci',
                permissions: ['*'],
            }],
        }),
        // POST /webhooks/github: point the App's webhook URL here
        routes: [gh.webhookRoute()],
        shutdown,
    });

    await engine.start();
    return {
        app,
        engine,
        shutdown,
    };
}
