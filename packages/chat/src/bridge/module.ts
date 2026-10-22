/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    InvalidAgentDefinitionError,
    InvalidRunStateError,
    hasPermission,
} from '@chamvi/core';
import type { Engine, Invoker } from '@chamvi/core';
import type { HttpRoute } from '@chamvi/http';
import type {
    ActionEvent,
    Author,
    Message,
    Thread,
} from 'chat';
import { createChatNotifier } from '../notifier/module.ts';
import { createChatTools } from '../tools/module.ts';
import { DEFAULT_CHANNEL_NAME } from '../trigger/constants.ts';
import { matchesChatTrigger } from '../trigger/helpers.ts';
import type { ChatEventKind, ChatPayload } from '../trigger/types.ts';
import { APPROVE_ACTION_ID, DENY_ACTION_ID } from './constants.ts';
import {
    boundKey,
    decodeApprovalValue,
    readHistory,
    resolveHistory,
    toFetchRequest,
    toRouteResult,
} from './helpers.ts';
import type { ChatBridgeOptions, IChatBridge } from './types.ts';

/**
 * Connects a Chat SDK instance to the engine. Inbound: each mention,
 * subscribed-thread message or direct message dispatches one run per agent
 * with a matching chatTrigger() (idempotency key = the platform message,
 * concurrency key and thread = the platform thread). Outbound: the notifier
 * posts approval cards whose buttons answer through `engine.approve()`, and
 * the `chat_reply` tool posts into the thread.
 */
export function createChatBridge(options: ChatBridgeOptions): IChatBridge {
    const name = options.name ?? DEFAULT_CHANNEL_NAME;
    if (typeof name !== 'string' || name.length === 0) {
        throw new InvalidAgentDefinitionError('A chat bridge name must not be empty.');
    }
    const pathPrefix = options.pathPrefix ?? `/channels/${name}`;
    if (!pathPrefix.startsWith('/') || pathPrefix.endsWith('/')) {
        throw new InvalidAgentDefinitionError('A chat bridge pathPrefix must start and not end with "/".');
    }
    const history = resolveHistory(options.history);
    const onError = options.onError ?? ((error: unknown) => console.error('[chamvi]', error));
    const { chat } = options;

    let engine: Engine | undefined;

    async function invokerOf(author: Author, adapter: string): Promise<Invoker | undefined> {
        return options.resolveInvoker ? options.resolveInvoker(author, { adapter }) : undefined;
    }

    async function dispatch(event: ChatEventKind, thread: Thread<any>, message: Message): Promise<void> {
        if (!engine || message.author.isMe) return;
        const adapter = thread.adapter.name;
        const payload: ChatPayload = {
            channel: name,
            adapter,
            event,
            threadId: thread.id,
            channelId: thread.channelId,
            message: {
                id: message.id,
                text: message.text,
                author: {
                    userId: message.author.userId,
                    userName: message.author.userName,
                    fullName: message.author.fullName,
                },
            },
        };

        const agents = engine.listAgents().flatMap((agent) => {
            const trigger = agent.definition.triggers?.find((t) => matchesChatTrigger(t, payload));
            return trigger ? [{ agent, trigger }] : [];
        });
        if (agents.length === 0) return;

        if (event === 'mention') await thread.subscribe();
        if (history > 0) payload.history = await readHistory(thread, message, history);
        const invoker = await invokerOf(message.author, adapter);
        const threadKey = boundKey(`${name}:${thread.id}`);

        let started = false;
        for (const { agent, trigger } of agents) {
            try {
                const { deduplicated } = await engine.dispatch({
                    agent: agent.name,
                    trigger: trigger.id,
                    source: 'channel',
                    payload,
                    idempotencyKey: boundKey(`${name}:${thread.id}:${message.id}`),
                    concurrencyKey: threadKey,
                    thread: threadKey,
                    ...(invoker ? { invoker } : {}),
                });
                started ||= !deduplicated;
            } catch (error) {
                onError(error);
            }
        }
        if (started) thread.startTyping().catch(onError);
    }

    async function answer(event: ActionEvent): Promise<void> {
        if (!engine) return;
        const ref = decodeApprovalValue(event.value);
        if (!ref) return;
        const { thread } = event;
        const tell = (text: string) => {
            thread?.postEphemeral(event.user, text, { fallbackToDM: false }).catch(onError);
        };

        const run = await engine.getRun(ref.runId);
        if (!run) {
            tell('This run no longer exists.');
            return;
        }
        const approver = await invokerOf(event.user, event.adapter.name);
        if (!approver || !hasPermission(approver.permissions, `agent:${run.agent}:approve`)) {
            tell('You may not answer approvals of this agent here. Answer it in the chamvi UI.');
            return;
        }

        const approved = event.actionId === APPROVE_ACTION_ID;
        try {
            await engine.approve(run.id, {
                approvalId: ref.approvalId,
                approved,
                approver,
            });
        } catch (error) {
            if (error instanceof InvalidRunStateError) {
                tell('This approval was already answered or has expired.');
                return;
            }
            throw error;
        }
        await thread?.post(`${approved ? 'Approved' : 'Denied'} by ${approver.name ?? approver.id}.`);
    }

    const guard = <A extends unknown[]>(fn: (...args: A) => Promise<void>) => async (...args: A) => {
        try {
            await fn(...args);
        } catch (error) {
            onError(error);
        }
    };

    return {
        name,
        notifier: createChatNotifier({
            name,
            chat,
            ...(options.approvalUrl ? { approvalUrl: options.approvalUrl } : {}),
            ...(options.target ? { target: options.target } : {}),
        }),

        routes(): HttpRoute[] {
            return Object.keys(chat.webhooks).map((adapter): HttpRoute => ({
                method: 'POST',
                path: `${pathPrefix}/${adapter}`,
                rateLimit: false,
                anyBody: true,
                async handler(request) {
                    const body = await request.readBody();
                    const webhook = (chat.webhooks as Record<string, (req: Request, opts?: object) => Promise<Response>>)[adapter]!;
                    const response = await webhook(toFetchRequest(request.request, body), {
                        // a long-lived process: background work only needs its errors reported
                        waitUntil: (task: Promise<unknown>) => {
                            task.catch(onError);
                        },
                    });
                    return toRouteResult(response);
                },
            }));
        },

        tools() {
            return createChatTools({ name, chat });
        },

        attach(target: Engine) {
            if (engine) {
                throw new InvalidAgentDefinitionError(`The chat bridge "${name}" is already attached.`);
            }
            engine = target;
            chat.onNewMention(guard((thread, message) => dispatch('mention', thread, message)));
            chat.onSubscribedMessage(guard((thread, message) => dispatch('message', thread, message)));
            chat.onDirectMessage(guard((thread, message) => dispatch('direct', thread, message)));
            chat.onAction([APPROVE_ACTION_ID, DENY_ACTION_ID], guard(answer));
        },
    };
}
