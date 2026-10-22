/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createHash } from 'node:crypto';
import { ValidationError, defineEffectTool } from '@chamvi/core';
import type { ToolContext } from '@chamvi/core';
import { jsonSchema } from 'ai';
import type { ToolSet } from 'ai';
import type { Chat } from 'chat';
import { STATE_TTL_MS } from '../bridge/constants.ts';
import { stateKey, threadOf } from '../bridge/helpers.ts';
import { REPLY_TEXT_MAX_LENGTH, REPLY_TOOL_NAME } from './constants.ts';
import type { ChatReply, ChatReplyInput } from './types.ts';

type ChatToolsInput = {
    name: string;
    chat: Chat<any>;
};

function requireThread(ctx: ToolContext, channel: string): string {
    const threadId = threadOf(ctx.run.trigger, channel);
    if (!threadId) {
        throw new ValidationError(`${REPLY_TOOL_NAME} only works in runs a "${channel}" chat message started.`);
    }
    return threadId;
}

/** One reply per run and text: the same text twice in a run posts once. */
function replyKey(input: ChatReplyInput, ctx: ToolContext): string {
    const digest = createHash('sha256').update(String(input.text)).digest('hex');
    return `${ctx.run.runId}:${REPLY_TOOL_NAME}:${digest}`;
}

/**
 * `chat_reply`, an effect tool: a recovered run reuses the recorded reply,
 * and a reply whose effect record was lost is found again in the Chat SDK
 * state, so a retried step posts once.
 */
export function createChatTools(input: ChatToolsInput): ToolSet {
    return {
        [REPLY_TOOL_NAME]: defineEffectTool<ChatReplyInput, ChatReply>({
            description: 'Post a message into the chat thread this run was started from. Use Markdown; keep it short.',
            inputSchema: jsonSchema<ChatReplyInput>({
                type: 'object',
                properties: {
                    text: {
                        type: 'string',
                        minLength: 1,
                        maxLength: REPLY_TEXT_MAX_LENGTH,
                        description: 'The message in Markdown.',
                    },
                },
                required: ['text'],
                additionalProperties: false,
            }),
            effectKey: (replyInput, ctx) => replyKey(replyInput, ctx),
            alreadyApplied: async (effectKey) => {
                await input.chat.initialize();
                const sent = await input.chat.getState().get<ChatReply>(stateKey('reply', effectKey));
                return sent ?? undefined;
            },
            execute: async ({ text }, { context }) => {
                if (typeof text !== 'string' || text.length === 0 || text.length > REPLY_TEXT_MAX_LENGTH) {
                    throw new ValidationError(`text must be 1 to ${REPLY_TEXT_MAX_LENGTH} characters.`);
                }
                const threadId = requireThread(context, input.name);
                await input.chat.initialize();
                const sent = await input.chat.thread(threadId).post({ markdown: text });
                const reply: ChatReply = { messageId: sent.id, threadId };
                await input.chat.getState().set(stateKey('reply', replyKey({ text }, context)), reply, STATE_TTL_MS);
                return reply;
            },
        }),
    };
}
