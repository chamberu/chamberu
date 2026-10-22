/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import { chatTrigger } from '@chamvi/chat';
import { matchesChatTrigger } from '../../../src/trigger/helpers.ts';
import type { ChatPayload } from '@chamvi/chat';

const payload: ChatPayload = {
    channel: 'chat',
    adapter: 'slack',
    event: 'mention',
    threadId: 'slack:C1:T1',
    channelId: 'slack:C1',
    message: {
        id: 'm1',
        text: '@bot hi',
        author: {
            userId: 'U1',
            userName: 'u1',
            fullName: 'U1',
        },
    },
};

describe('chatTrigger', () => {
    it('defaults to every event of the "chat" bridge', () => {
        const trigger = chatTrigger();
        expect(trigger.source).toBe('channel');
        expect(trigger.id).toBe('chat:chat:mention,message,direct');
        expect(trigger.options).toEqual({ channel: 'chat', on: ['mention', 'message', 'direct'] });
    });

    it.each([
        [{ channel: '' }],
        [{ on: [] }],
        [{ on: ['reaction' as never] }],
        [{ adapters: [] }],
        [{ adapters: [''] }],
    ])('refuses %o', (options) => {
        expect(() => chatTrigger(options)).toThrow(InvalidAgentDefinitionError);
    });

    it('matches by bridge, event, adapter and filter', () => {
        expect(matchesChatTrigger(chatTrigger(), payload)).toBe(true);
        expect(matchesChatTrigger(chatTrigger({ channel: 'ops' }), payload)).toBe(false);
        expect(matchesChatTrigger(chatTrigger({ on: ['direct'] }), payload)).toBe(false);
        expect(matchesChatTrigger(chatTrigger({ adapters: ['teams'] }), payload)).toBe(false);
        expect(matchesChatTrigger(chatTrigger({ filter: (p) => p.message.text.includes('deploy') }), payload)).toBe(false);
        expect(matchesChatTrigger({
            source: 'http',
            id: 'http',
            options: {},
        }, payload)).toBe(false);
    });
});
