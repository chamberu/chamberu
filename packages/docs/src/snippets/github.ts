import type { LanguageModel } from 'ai';
import type { IStore } from '@chamberu/core';
import {
    Engine,
    cron,
    defineAgent,
    requireToolPermission,
} from '@chamberu/core';
import { createGithubApp, githubWebhook } from '@chamberu/github';
import { createHttpApp, staticTokens } from '@chamberu/http';

export function createTriage(model: LanguageModel, store: IStore) {
    // #region app
    const gh = createGithubApp({
        appId: process.env.GITHUB_APP_ID ?? '',
        // a one-line PEM with literal \n works
        privateKey: process.env.GITHUB_PRIVATE_KEY ?? '',
        // [old, new] while rotating the secret
        webhookSecret: process.env.GITHUB_WEBHOOK_SECRET ?? '',
        // the bot login without a GET /app
        slug: 'octo-triage',
        // for runs not started by a delivery (the cron sweep below)
        installationId: 12345678,
    });
    // #endregion app

    // #region agent
    const triage = defineAgent({
        name: 'triage',
        model,
        instructions: 'Label new issues and ask for missing details in one comment.',
        triggers: [
            githubWebhook({
                events: ['issues.opened'],
                // skip issues opened by bots
                filter: (event) => event.payload.sender?.type !== 'Bot',
            }),
            // a sweep for issues missed while the app was down
            cron('0 * * * *'),
        ],
        tools: () => ({ ...gh.readTools(), ...gh.writeTools() }),
        approvals: { github_close_issue: 'user' },
        // delivery and cron runs have no invoker
        toolPolicy: requireToolPermission({ withoutInvoker: 'allow' }),
    });
    // #endregion agent

    // #region http
    const engine = new Engine({
        store,
        agents: [triage],
        resumeSecret: process.env.RESUME_SECRET ?? '',
    });
    const app = createHttpApp({
        engine,
        auth: staticTokens({
            tokens: [{
                value: process.env.CHAMBERU_TOKEN ?? '',
                id: 'ci',
                permissions: ['*'],
            }],
        }),
        // POST /webhooks/github; raise for large push or pull_request deliveries
        bodyLimit: 4 * 1024 * 1024,
        routes: [gh.webhookRoute()],
    });
    // #endregion http

    return {
        app,
        engine,
        gh,
    };
}
