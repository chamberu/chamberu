/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Message } from 'chat';
import type {
    Adapter,
    AdapterPostableMessage,
    Author,
    ChatInstance,
    WebhookOptions,
} from 'chat';

export type FakePost = {
    threadId: string;
    message: AdapterPostableMessage;
};

export type FakeEphemeral = {
    threadId: string;
    userId: string;
    message: AdapterPostableMessage;
};

export type FakeDelivery =    | {
    type: 'message';
    id: string;
    channel: string;
    thread: string;
    text: string;
    user: string;
    isBot?: boolean;
} |
    {
        type: 'action';
        actionId: string;
        value: string;
        channel: string;
        thread: string;
        messageId: string;
        user: string;
    };

export type FakeAdapter = Adapter & {
    posts: FakePost[];
    ephemerals: FakeEphemeral[];
    typing: string[];
    /** Messages fetchMessages() answers, newest last. */
    threadMessages: Map<string, Message[]>;
};

const BOT_USER = 'U-BOT';

function author(user: string, isMe: boolean): Author {
    return {
        userId: user,
        userName: user.toLowerCase(),
        fullName: user,
        isBot: isMe,
        isMe,
    };
}

export function fakeMessage(input: {
    id: string;
    threadId: string;
    text: string;
    user: string;
    isMe?: boolean;
    isMention?: boolean;
}): Message {
    return new Message({
        id: input.id,
        threadId: input.threadId,
        text: input.text,
        formatted: { type: 'root', children: [] },
        raw: {},
        author: author(input.user, input.isMe ?? false),
        metadata: { dateSent: new Date(0), edited: false },
        attachments: [],
        isMention: input.isMention ?? input.text.includes('@bot'),
    });
}

/**
 * An in-process Chat SDK adapter: deliveries are JSON bodies (the shape of
 * `FakeDelivery`) a test posts to the bridge's route; posts, ephemerals and
 * typing indicators are recorded.
 */
export function createFakeAdapter(name = 'slack'): FakeAdapter {
    let chat: ChatInstance | undefined;
    let posted = 0;
    const encode = (channel: string, thread: string) => `${name}:${channel}:${thread}`;

    const adapter: FakeAdapter = {
        name,
        userName: 'bot',
        botUserId: BOT_USER,
        posts: [],
        ephemerals: [],
        typing: [],
        threadMessages: new Map(),

        async initialize(instance) {
            chat = instance;
        },

        async handleWebhook(request: Request, options?: WebhookOptions) {
            const delivery = await request.json() as FakeDelivery;
            const threadId = encode(delivery.channel, delivery.thread);
            if (delivery.type === 'message') {
                const message = fakeMessage({
                    id: delivery.id,
                    threadId,
                    text: delivery.text,
                    user: delivery.isBot ? BOT_USER : delivery.user,
                    isMe: delivery.isBot ?? false,
                });
                await chat!.processMessage(adapter, threadId, message, options);
            } else {
                await chat!.processAction({
                    adapter,
                    actionId: delivery.actionId,
                    value: delivery.value,
                    messageId: delivery.messageId,
                    threadId,
                    user: author(delivery.user, false),
                    raw: {},
                }, options);
            }
            return new Response('ok', { status: 200 });
        },

        encodeThreadId: (data: unknown) => {
            const { channel, thread } = data as { channel: string; thread: string };
            return encode(channel, thread);
        },
        decodeThreadId: (threadId: string) => {
            const [, channel, thread] = threadId.split(':');
            return { channel, thread };
        },
        channelIdFromThreadId: (threadId: string) => threadId.split(':').slice(0, 2).join(':'),
        isDM: (threadId: string) => threadId.includes(':D'),

        parseMessage: () => {
            throw new Error('not used');
        },
        renderFormatted: () => '',

        async postMessage(threadId, message) {
            adapter.posts.push({ threadId, message });
            return {
                id: `posted-${++posted}`,
                threadId,
                raw: {},
            };
        },
        async postChannelMessage(channelId, message) {
            adapter.posts.push({ threadId: channelId, message });
            return {
                id: `posted-${++posted}`,
                threadId: channelId,
                raw: {},
            };
        },
        async postEphemeral(threadId, userId, message) {
            adapter.ephemerals.push({
                threadId,
                userId,
                message,
            });
            return {
                id: `ephemeral-${adapter.ephemerals.length}`,
                threadId,
                usedFallback: false,
                raw: {},
            };
        },
        async editMessage(threadId) {
            return {
                id: 'edited',
                threadId,
                raw: {},
            };
        },
        deleteMessage: async () => undefined,
        addReaction: async () => undefined,
        removeReaction: async () => undefined,
        async startTyping(threadId) {
            adapter.typing.push(threadId);
        },
        async fetchMessages(threadId) {
            const messages = [...(adapter.threadMessages.get(threadId) ?? [])];
            return { messages, nextCursor: undefined };
        },
        async fetchThread(threadId) {
            return {
                id: threadId,
                channelId: adapter.channelIdFromThreadId(threadId),
                metadata: {},
            };
        },
    } as FakeAdapter;

    return adapter;
}
