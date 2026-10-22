/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { z } from 'zod';
import {
    Engine,
    MemoryStore,
    createResumeToken,
    defineAgent,
    defineTool,
    injectChannel,
} from '@chamvi/core';
import type { ChannelMessage, IChannel } from '@chamvi/core';
import { cron, cronChannel } from '@chamvi/channel-cron';
import {
    createHttpApp,
    http,
    httpChannel,
    mcpChannel,
    staticTokens,
} from '@chamvi/http';
import { uiRoutes } from '@chamvi/ui';
import { serve } from 'routup';
import { E2E_PORT, E2E_TOKEN } from './constants.ts';
import { createDemoModel } from './model.ts';

const RESUME_SECRET = 'e2e-resume-secret';

/** Keeps the latest approval message, so the deep-link test can open its run's token. */
let lastApproval: ChannelMessage | undefined;
const capture: IChannel = {
    name: 'capture',
    async out(message) {
        if (message.kind === 'approval') lastApproval = message;
    },
};

const store = new MemoryStore();

const engine = new Engine({
    store,
    agents: [
        defineAgent({
            name: 'deploy',
            model: createDemoModel(),
            instructions: 'Deploy the requested environment.',
            channels: [http.on()],
            tools: {
                deploy: defineTool({
                    description: 'Deploy an environment.',
                    inputSchema: z.object({ env: z.string() }),
                    execute: async ({ env }, { context }) => {
                        const decision = await injectChannel(context, 'capture').approve({
                            title: `Deploy ${env}?`,
                            body: `Rolls the demo release out to ${env}.`,
                            address: 'ops',
                        });
                        return decision.approved ? { deployed: env } : { denied: decision.reason ?? 'denied' };
                    },
                }),
            },
        }),
        defineAgent({
            name: 'digest',
            model: createDemoModel(),
            instructions: 'Write the morning digest.',
            channels: [cron.on('0 8 * * 1-5', { timezone: 'Europe/Berlin' })],
            state: { sent: z.object({ issues: z.number(), channel: z.string() }) },
        }),
    ],
    channels: [httpChannel(), mcpChannel(), cronChannel(), capture],
    resumeSecret: RESUME_SECRET,
    claimTtlMs: 3000,
});

/**
 * The resume token of the latest approval message's run while it still waits
 * on it. No channel message carries a token, so the demo signs one the way
 * the engine does, for the deep-link test only.
 */
async function lastToken(): Promise<string | null> {
    if (!lastApproval?.approvalId) return null;
    const run = await engine.getRun(lastApproval.runId);
    const waiting = run?.waiting;
    if (!waiting || waiting.approvalId !== lastApproval.approvalId) return null;
    return createResumeToken(RESUME_SECRET, {
        runId: lastApproval.runId,
        approvalId: waiting.approvalId,
        tokenId: waiting.tokenId,
        expiresAt: waiting.expiresAt,
    });
}

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
            // demo only: a token for the latest approval message, for the deep-link test
            method: 'GET',
            path: '/e2e/last-token',
            handler: async ({ request }) => {
                if (request.headers.get('authorization') !== `Bearer ${E2E_TOKEN}`) return { status: 401 };
                return { status: 200, body: { token: await lastToken() } };
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
