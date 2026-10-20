import type { LanguageModel } from 'ai';
import { MemoryStore, RunEngine, defineAgent } from '@chamberu/core';
import { createGithubApp, githubWebhook } from '@chamberu/github';
import type { GithubAppOptions } from '@chamberu/github';
import { createHttpApp, createShutdown, staticTokens } from '@chamberu/http';

export async function createTriageServer(
    model: LanguageModel,
    options: Pick<GithubAppOptions, 'fetch' | 'clock'> = {},
) {
    const {
        GITHUB_APP_ID,
        GITHUB_PRIVATE_KEY,
        GITHUB_WEBHOOK_SECRET,
        CHAMBERU_TOKEN,
    } = process.env;
    if (!GITHUB_APP_ID || !GITHUB_PRIVATE_KEY || !GITHUB_WEBHOOK_SECRET || !CHAMBERU_TOKEN) {
        throw new Error('Set GITHUB_APP_ID, GITHUB_PRIVATE_KEY, GITHUB_WEBHOOK_SECRET and CHAMBERU_TOKEN.');
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

    const agents = [triage];
    const store = new MemoryStore();
    const engine = new RunEngine({
        store,
        agents,
        resumeSecret: 'change-me',
    });

    const shutdown = createShutdown({ engine });
    const app = createHttpApp({
        engine,
        store,
        agents,
        auth: staticTokens({ tokens: { [CHAMBERU_TOKEN]: { id: 'ci', permissions: ['*'] } } }),
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
