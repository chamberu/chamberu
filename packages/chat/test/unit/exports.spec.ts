/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import * as pkg from '@chamvi/chat';

describe('public api', () => {
    it.each([
        'chatTrigger',
        'createChatBridge',
    ])('exports %s', (name) => {
        expect(pkg[name as keyof typeof pkg]).toBeTypeOf('function');
    });

    it('exports the constants', () => {
        expect(pkg.DEFAULT_CHANNEL_NAME).toBe('chat');
        expect(pkg.APPROVE_ACTION_ID).toBe('chamvi:approve');
        expect(pkg.DENY_ACTION_ID).toBe('chamvi:deny');
        expect(pkg.REPLY_TOOL_NAME).toBe('chat_reply');
        expect(pkg.REPLY_TEXT_MAX_LENGTH).toBe(3_000);
        expect(pkg.NOTIFICATION_BODY_MAX_LENGTH).toBe(2_900);
    });

    it.each([
        'matchesChatTrigger',
        'createChatNotifier',
        'createChatTools',
        'boundKey',
        'threadOf',
        'STATE_KEY_PREFIX',
    ])('keeps %s internal', (name) => {
        expect(pkg).not.toHaveProperty(name);
    });
});
