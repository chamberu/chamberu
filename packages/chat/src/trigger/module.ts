/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError } from '@chamvi/core';
import type { TriggerDefinition } from '@chamvi/core';
import { CHAT_EVENT_KINDS, DEFAULT_CHANNEL_NAME } from './constants.ts';
import type { ChatPayload, ChatTriggerOptions } from './types.ts';

/**
 * Starts the agent from chat messages a `createChatBridge()` receives.
 * Runs of one thread queue behind each other (concurrency key = thread),
 * and a platform redelivery of the same message dedupes to the first run.
 */
export function chatTrigger(options: ChatTriggerOptions = {}): TriggerDefinition<ChatPayload> {
    const channel = options.channel ?? DEFAULT_CHANNEL_NAME;
    if (typeof channel !== 'string' || channel.length === 0) {
        throw new InvalidAgentDefinitionError('A chatTrigger() channel must not be empty.');
    }

    const on = options.on ? [...options.on] : [...CHAT_EVENT_KINDS];
    if (on.length === 0 || on.some((kind) => !CHAT_EVENT_KINDS.includes(kind))) {
        throw new InvalidAgentDefinitionError(`chatTrigger() on must name ${CHAT_EVENT_KINDS.join(', ')}.`);
    }

    const adapters = options.adapters ? [...options.adapters] : undefined;
    if (adapters && (adapters.length === 0 || adapters.some((name) => typeof name !== 'string' || name.length === 0))) {
        throw new InvalidAgentDefinitionError('chatTrigger() adapters must be non-empty names.');
    }

    return {
        source: 'channel',
        id: options.id ?? `chat:${channel}:${on.join(',')}`,
        options: {
            channel,
            on,
            ...(adapters ? { adapters } : {}),
            ...(options.filter ? { filter: options.filter } : {}),
        },
    };
}
