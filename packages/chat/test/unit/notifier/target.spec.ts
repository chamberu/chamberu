/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import type { NotifyOptions } from '@chamvi/core';
import { setupChat } from '../../utils/setup.ts';

const notification = {
    kind: 'info' as const,
    agent: 'helper',
    runId: 'run-1',
    title: 'Daily digest',
    body: 'All quiet.',
};

function optionsOf(key: string): NotifyOptions {
    return {
        idempotencyKey: key,
        trigger: {
            id: 'e1',
            agent: 'helper',
            trigger: 'cron:0 8 * * *',
            source: 'cron',
            payload: {},
            receivedAt: new Date(0),
        },
    };
}

describe('chat notifier targets', () => {
    it('needs a target for runs no chat message started', async () => {
        const ctx = setupChat();
        await expect(ctx.bridge.notifier.notify(notification, optionsOf('k1'))).rejects.toThrow(InvalidAgentDefinitionError);
    });

    it('posts to a target channel or thread, once per key', async () => {
        const channel = setupChat({ bridge: { target: { channelId: 'slack:C-OPS' } } });
        await channel.bridge.notifier.notify(notification, optionsOf('k1'));
        await channel.bridge.notifier.notify(notification, optionsOf('k1'));
        expect(channel.adapter.posts).toEqual([{ threadId: 'slack:C-OPS', message: '**Daily digest**\n\nAll quiet.' }]);

        const thread = setupChat({ bridge: { target: { threadId: 'slack:C-OPS:T9' } } });
        await thread.bridge.notifier.notify(notification, optionsOf('k2'));
        expect(thread.adapter.posts.map((p) => p.threadId)).toEqual(['slack:C-OPS:T9']);
    });

    it('cuts long bodies', async () => {
        const ctx = setupChat({ bridge: { target: { channelId: 'slack:C-OPS' } } });
        await ctx.bridge.notifier.notify({ ...notification, body: 'x'.repeat(3_000) }, optionsOf('k3'));
        expect(String(ctx.adapter.posts[0]!.message)).toContain('… (cut, 100 more characters)');
    });
});
