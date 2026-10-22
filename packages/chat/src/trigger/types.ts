/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/**
 * What started the run: a mention of the bot, a message in a thread the bot
 * subscribed to after a mention, or a direct message.
 */
export type ChatEventKind = 'mention' | 'message' | 'direct';

export type ChatAuthor = {
    userId: string;
    userName: string;
    fullName: string;
};

export type ChatHistoryEntry = {
    author: string;
    text: string;
    /** true for messages the bot posted itself. */
    fromBot: boolean;
};

/** The envelope payload of a run a chat message started. */
export type ChatPayload = {
    /** The bridge name, e.g. 'chat'. */
    channel: string;
    /** The Chat SDK adapter name, e.g. 'slack'. */
    adapter: string;
    event: ChatEventKind;
    /** The Chat SDK thread id (adapter-prefixed), the target of replies and approval cards. */
    threadId: string;
    channelId: string;
    message: {
        id: string;
        text: string;
        author: ChatAuthor;
    };
    /** Earlier messages of the thread, oldest first, when the bridge's `history` is above 0. */
    history?: ChatHistoryEntry[];
};

export type ChatTriggerOptions = {
    /** Unique within the agent; default `chat:<channel>:<on joined by ','>`. */
    id?: string;
    /** The bridge name the trigger listens to; default 'chat'. */
    channel?: string;
    /** Default `['mention', 'message', 'direct']`. */
    on?: ChatEventKind[];
    /** Adapter names (e.g. `['slack']`); default every adapter of the bridge. */
    adapters?: string[];
    /** false skips the message; runs before dispatch. */
    filter?: (payload: ChatPayload) => boolean;
};
