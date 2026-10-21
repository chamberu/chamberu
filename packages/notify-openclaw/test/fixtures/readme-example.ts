import { tool } from 'ai';
import type { LanguageModel } from 'ai';
import { z } from 'zod';
import {
    Engine,
    MemoryStore,
    defineAgent,
    http,
} from '@chamvi/core';
import { openclaw } from '@chamvi/notify-openclaw';
import type { OpenclawNotifierOptions } from '@chamvi/notify-openclaw';

export function createApprovalEngine(
    model: LanguageModel,
    options: Pick<OpenclawNotifierOptions, 'fetch' | 'clock'> = {},
): Engine {
    const {
        OPENCLAW_URL,
        OPENCLAW_HOOKS_TOKEN,
        OPENCLAW_CHANNEL,
        OPENCLAW_TO,
        RESUME_SECRET,
        APP_URL,
    } = process.env;
    if (!OPENCLAW_URL || !OPENCLAW_HOOKS_TOKEN || !OPENCLAW_CHANNEL || !OPENCLAW_TO || !RESUME_SECRET || !APP_URL) {
        throw new Error('Set OPENCLAW_URL, OPENCLAW_HOOKS_TOKEN, OPENCLAW_CHANNEL, OPENCLAW_TO, RESUME_SECRET and APP_URL.');
    }

    const deploy = tool({
        description: 'Deploy the current release to an environment.',
        inputSchema: z.object({ env: z.enum(['staging', 'prod']) }),
        execute: async ({ env }) => `deployed to ${env}`,
    });

    const deployer = defineAgent({
        name: 'deployer',
        model,
        instructions: 'Deploy the release the user asks for.',
        triggers: [http()],
        tools: { deploy },
        // every deploy waits for the owner, who is asked in the chat
        approvals: { deploy: 'user' },
        notify: 'openclaw',
    });

    return new Engine({
        store: new MemoryStore({ clock: options.clock }),
        agents: [deployer],
        notifiers: {
            openclaw: openclaw({
                baseUrl: OPENCLAW_URL,
                // OpenClaw's hooks.token, not the gateway token
                hooksToken: OPENCLAW_HOOKS_TOKEN,
                deliver: { channel: OPENCLAW_CHANNEL, to: OPENCLAW_TO },
                // the message carries only this link; resumeTool: true would add the token itself
                resumeUrl: (token) => `${APP_URL}/ui/approvals?token=${encodeURIComponent(token)}`,
                ...options,
            }),
        },
        resumeSecret: RESUME_SECRET,
        clock: options.clock,
    });
}
