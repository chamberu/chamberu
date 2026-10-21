/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { tool } from 'ai';
import { z } from 'zod';
import {
    Engine,
    MemoryStore,
    cron,
    defineAgent,
    http,
} from '@chamvi/core';
import type { INotifier, Notification } from '@chamvi/core';
import { createHttpApp, staticTokens } from '@chamvi/http';
import { uiRoutes } from '@chamvi/ui';
import { serve } from 'routup';
import { E2E_PORT, E2E_TOKEN } from './constants.ts';
import { createDemoModel } from './model.ts';

/** Keeps the latest approval token, so the deep-link test can open it. */
class CapturingNotifier implements INotifier {
    readonly name = 'capture';

    lastToken: string | undefined;

    async notify(notification: Notification): Promise<void> {
        if (notification.kind === 'approval') this.lastToken = notification.resumeToken;
    }
}

const notifier = new CapturingNotifier();
const store = new MemoryStore();

const engine = new Engine({
    store,
    agents: [
        defineAgent({
            name: 'deploy',
            model: createDemoModel(),
            instructions: 'Deploy the requested environment.',
            triggers: [http()],
            tools: {
                deploy: tool({
                    description: 'Deploy an environment.',
                    inputSchema: z.object({ env: z.string() }),
                    execute: async ({ env }) => ({ deployed: env }),
                }),
            },
            approvals: { deploy: 'user' },
            notify: 'capture',
        }),
        defineAgent({
            name: 'digest',
            model: createDemoModel(),
            instructions: 'Write the morning digest.',
            triggers: [cron('0 8 * * 1-5', { timezone: 'Europe/Berlin' })],
            state: { sent: z.object({ issues: z.number(), channel: z.string() }) },
        }),
    ],
    notifiers: { capture: notifier },
    resumeSecret: 'e2e-resume-secret',
    claimTtlMs: 3000,
});

await store.kvSet('digest', 'last_digest_at', '2026-10-21T06:00:12.481Z');
await store.kvSet('digest', 'recipients', ['#maintainers']);
await store.docUpsert('digest', 'sent', '2026-10-21', { issues: 14, channel: '#maintainers' });

const app = createHttpApp({
    engine,
    auth: [staticTokens({
        tokens: [{
            value: E2E_TOKEN,
            id: 'e2e',
            permissions: ['*'],
        }],
    })],
    metrics: false,
    routes: [
        ...uiRoutes(),
        {
            // demo only: the token the notifier received, for the deep-link test
            method: 'GET',
            path: '/e2e/last-token',
            handler: async ({ request }) => {
                if (request.headers.get('authorization') !== `Bearer ${E2E_TOKEN}`) return { status: 401 };
                return { status: 200, body: { token: notifier.lastToken ?? null } };
            },
        },
    ],
});

await engine.start();
serve(app, {
    port: E2E_PORT,
    hostname: '127.0.0.1',
    gracefulShutdown: false,
});
