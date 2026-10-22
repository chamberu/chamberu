/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import { chatTrigger, createChatBridge } from '@chamvi/chat';
import type { ChatPayload } from '@chamvi/chat';
import { fakeMessage } from '../../utils/adapter.ts';
import { OWNER, mention, setupChat } from '../../utils/setup.ts';

async function runs(ctx: ReturnType<typeof setupChat>) {
    return (await ctx.engine.store.listRuns({ order: 'asc' })).data;
}

describe('createChatBridge inbound', () => {
    it('serves one route per adapter', () => {
        const ctx = setupChat();
        expect(ctx.bridge.routes().map((r) => [r.method, r.path, r.rateLimit, r.anyBody])).toEqual([
            ['POST', '/channels/chat/slack', false, true],
        ]);
    });

    it('dispatches a mention as a channel run keyed by thread and message', async () => {
        const ctx = setupChat();
        expect(await ctx.deliver(mention())).toBe(200);

        const [run] = await runs(ctx);
        expect(run).toBeDefined();
        expect(run!.trigger.source).toBe('channel');
        expect(run!.trigger.trigger).toBe('chat:chat:mention,message,direct');
        expect(run!.trigger.thread).toBe('chat:slack:C1:T1');
        expect(run!.trigger.concurrencyKey).toBe('chat:slack:C1:T1');
        expect(run!.trigger.idempotencyKey).toBe('chat:slack:C1:T1:m1');
        expect(run!.trigger.invoker).toBeUndefined();
        const payload = run!.trigger.payload as ChatPayload;
        expect(payload).toMatchObject({
            channel: 'chat',
            adapter: 'slack',
            event: 'mention',
            threadId: 'slack:C1:T1',
            message: {
                id: 'm1',
                text: '@bot hello',
                author: { userId: 'U-ALICE' },
            },
        });
        expect(ctx.adapter.typing).toEqual(['slack:C1:T1']);
        expect(await ctx.chat.getState().isSubscribed('slack:C1:T1')).toBe(true);
        expect(ctx.errors).toEqual([]);
    });

    it('routes a follow-up in the subscribed thread as a message event', async () => {
        const ctx = setupChat();
        await ctx.deliver(mention());
        await ctx.deliver(mention('and one more thing', { id: 'm2' }));
        const events = (await runs(ctx)).map((r) => (r.trigger.payload as ChatPayload).event).sort();
        expect(events).toEqual(['mention', 'message']);
    });

    it('dedupes a redelivered message', async () => {
        const ctx = setupChat();
        await ctx.deliver(mention());
        await ctx.deliver(mention(), { 'x-retry': '1' });
        expect(await runs(ctx)).toHaveLength(1);
    });

    it('ignores the bot itself and agents without a matching trigger', async () => {
        const ctx = setupChat({ agents: [{ triggers: [chatTrigger({ adapters: ['teams'] })] }] });
        await ctx.deliver(mention());
        expect(await runs(ctx)).toHaveLength(0);
        expect(ctx.adapter.typing).toEqual([]);

        const own = setupChat();
        await own.deliver(mention('@bot I said this', { isBot: true }));
        expect(await runs(own)).toHaveLength(0);
    });

    it('takes the invoker from resolveInvoker', async () => {
        const ctx = setupChat({ bridge: { resolveInvoker: (author) => (author.userId === 'U-ALICE' ? { ...OWNER, id: 'U-ALICE' } : undefined) } });
        await ctx.deliver(mention());
        const [run] = await runs(ctx);
        expect(run!.trigger.invoker).toEqual({ ...OWNER, id: 'U-ALICE' });
    });

    it('puts earlier thread messages into the payload, oldest first', async () => {
        const ctx = setupChat({ bridge: { history: 2 } });
        ctx.adapter.threadMessages.set('slack:C1:T1', [
            fakeMessage({
                id: 'h1',
                threadId: 'slack:C1:T1',
                text: 'first',
                user: 'U-BOB',
            }),
            fakeMessage({
                id: 'h2',
                threadId: 'slack:C1:T1',
                text: 'second',
                user: 'U-BOT',
                isMe: true,
            }),
            fakeMessage({
                id: 'h3',
                threadId: 'slack:C1:T1',
                text: 'third',
                user: 'U-BOB',
            }),
            fakeMessage({
                id: 'm1',
                threadId: 'slack:C1:T1',
                text: '@bot hello',
                user: 'U-ALICE',
            }),
        ]);
        await ctx.deliver(mention());
        const [run] = await runs(ctx);
        expect((run!.trigger.payload as ChatPayload).history).toEqual([
            {
                author: 'u-bot',
                text: 'second',
                fromBot: true,
            },
            {
                author: 'u-bob',
                text: 'third',
                fromBot: false,
            },
        ]);
    });

    it('validates its options and attaches once', () => {
        const ctx = setupChat();
        expect(() => ctx.bridge.attach(ctx.engine)).toThrow(InvalidAgentDefinitionError);
        expect(() => createChatBridge({ chat: ctx.chat, name: '' })).toThrow(InvalidAgentDefinitionError);
        expect(() => createChatBridge({ chat: ctx.chat, pathPrefix: 'channels' })).toThrow(InvalidAgentDefinitionError);
        expect(() => createChatBridge({ chat: ctx.chat, history: 101 })).toThrow(InvalidAgentDefinitionError);
    });
});
