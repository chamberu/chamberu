/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    Engine,
    MemoryStore,
    defineAgent,
} from '@chamvi/core';
import type { AgentDefinition, Invoker } from '@chamvi/core';
import type { HttpRoute } from '@chamvi/http';
import { ControllableClock } from '@chamvi/test-kit';
import { createMemoryState } from '@chat-adapter/state-memory';
import { Chat } from 'chat';
import { chatTrigger, createChatBridge } from '@chamvi/chat';
import type { ChatBridgeOptions, IChatBridge } from '@chamvi/chat';
import { createFakeAdapter } from './adapter.ts';
import type { FakeAdapter, FakeDelivery } from './adapter.ts';
import { textModel } from './model.ts';

export const OWNER: Invoker = {
    id: 'U-OWNER',
    kind: 'slack',
    name: 'Owner',
    permissions: ['agent:*:approve'],
};

export type ChatSetup = {
    adapter: FakeAdapter;
    chat: Chat<any>;
    bridge: IChatBridge;
    engine: Engine;
    clock: ControllableClock;
    errors: unknown[];
    route: HttpRoute;
    deliver: (delivery: FakeDelivery, headers?: Record<string, string>) => Promise<number>;
};

type AgentPatch = Partial<AgentDefinition> & { name?: string };

export function setupChat(options: {
    agents?: AgentPatch[];
    bridge?: Partial<Omit<ChatBridgeOptions, 'chat'>>;
} = {}): ChatSetup {
    const clock = new ControllableClock(new Date('2026-10-22T12:00:00.000Z'));
    const adapter = createFakeAdapter('slack');
    const chat = new Chat({
        userName: 'bot',
        adapters: { slack: adapter },
        state: createMemoryState(),
        logger: 'silent',
    });
    const errors: unknown[] = [];
    const bridge = createChatBridge({
        chat,
        history: 0,
        onError: (error) => {
            errors.push(error);
        },
        ...options.bridge,
    });
    const agents = (options.agents ?? [{}]).map((patch) => defineAgent({
        name: 'helper',
        model: textModel(),
        instructions: 'Help in the thread.',
        triggers: [chatTrigger()],
        ...patch,
    } as AgentDefinition));
    const engine = new Engine({
        store: new MemoryStore({ clock }),
        agents,
        notifiers: { chat: bridge.notifier },
        resumeSecret: 'resume-secret',
        clock,
        claimTtlMs: 30,
        onError: (error) => {
            errors.push(error);
        },
    });
    bridge.attach(engine);
    const [route] = bridge.routes();

    const deliver = async (delivery: FakeDelivery, headers: Record<string, string> = {}) => {
        const body = new TextEncoder().encode(JSON.stringify(delivery));
        const result = await route!.handler({
            request: new Request(`http://localhost${route!.path}`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', ...headers },
            }),
            readBody: async () => body,
            subpath: '',
        }, {} as never);
        return result.status;
    };

    return {
        adapter,
        chat,
        bridge,
        engine,
        clock,
        errors,
        route: route!,
        deliver,
    };
}

export function mention(text = '@bot hello', patch: Partial<FakeDelivery & { type: 'message' }> = {}): FakeDelivery {
    return {
        type: 'message',
        id: 'm1',
        channel: 'C1',
        thread: 'T1',
        text,
        user: 'U-ALICE',
        ...patch,
    };
}
