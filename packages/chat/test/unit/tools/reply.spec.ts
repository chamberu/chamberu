/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';
import { http } from '@chamvi/core';
import { REPLY_TOOL_NAME, chatTrigger } from '@chamvi/chat';
import { mockModel } from '../../utils/model.ts';
import { mention, setupChat } from '../../utils/setup.ts';
import type { ChatSetup } from '../../utils/setup.ts';

const setups: ChatSetup[] = [];

afterEach(async () => {
    await Promise.all(setups.map((ctx) => ctx.engine.stop()));
    setups.length = 0;
});

function replyModel(texts: string[]) {
    return mockModel([
        {
            parts: texts.map((text, i) => ({
                type: 'tool-call' as const,
                toolName: REPLY_TOOL_NAME,
                input: { text },
                toolCallId: `reply-${i}`,
            })),
        },
        { parts: [{ type: 'text', text: 'done' }] },
    ]);
}

function setup(texts: string[]) {
    let bridgeTools: () => Record<string, unknown> = () => ({});
    const ctx = setupChat({
        agents: [{
            model: replyModel(texts),
            triggers: [chatTrigger(), http()],
            tools: () => bridgeTools() as never,
        }],
    });
    bridgeTools = () => ctx.bridge.tools();
    setups.push(ctx);
    return ctx;
}

describe('chat_reply', () => {
    it('posts into the thread the run started from, once per text', async () => {
        const ctx = setup(['Looking into it.', 'Looking into it.']);
        await ctx.engine.start();
        await ctx.deliver(mention());
        await ctx.engine.idle();

        const replies = ctx.adapter.posts.filter((p) => JSON.stringify(p.message).includes('Looking into it.'));
        expect(replies).toHaveLength(1);
        expect(replies[0]).toEqual({ threadId: 'slack:C1:T1', message: { markdown: 'Looking into it.' } });
        const { data: [run] } = await ctx.engine.store.listRuns({});
        expect(run!.status).toBe('completed');
        expect(ctx.errors).toEqual([]);
    });

    it('finds a reply again through the state after a lost effect record', async () => {
        const ctx = setup(['Hello.']);
        const tool = ctx.bridge.tools()[REPLY_TOOL_NAME] as unknown as { [key: symbol]: { alreadyApplied: (key: string) => Promise<unknown> } };
        const hooks = Object.getOwnPropertySymbols(tool).map((s) => tool[s]).find((v) => typeof v === 'object' && v !== null && 'alreadyApplied' in v)!;
        expect(await hooks.alreadyApplied('run-1:chat_reply:x')).toBeUndefined();
        await ctx.chat.getState().set('chamvi:reply:run-1:chat_reply:x', { messageId: 'posted-9', threadId: 'slack:C1:T1' });
        expect(await hooks.alreadyApplied('run-1:chat_reply:x')).toEqual({ messageId: 'posted-9', threadId: 'slack:C1:T1' });
    });

    it('fails the call in runs no chat message started', async () => {
        const ctx = setup(['Hello.']);
        await ctx.engine.start();
        const { runId } = await ctx.engine.dispatch({
            agent: 'helper',
            trigger: 'http',
            source: 'http',
            payload: {},
        });
        await ctx.engine.idle();
        expect(ctx.adapter.posts).toHaveLength(0);
        const steps = await ctx.engine.store.listSteps(runId);
        expect(JSON.stringify(steps)).toContain('only works in runs a \\"chat\\" chat message started');
    });
});
