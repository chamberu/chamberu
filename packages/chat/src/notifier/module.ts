/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError } from '@chamvi/core';
import type { INotifier, Notification, NotifyOptions } from '@chamvi/core';
import {
    Actions,
    Button,
    Card,
    CardText,
    LinkButton,
} from 'chat';
import type { CardElement, Chat } from 'chat';
import { APPROVE_ACTION_ID, DENY_ACTION_ID, STATE_TTL_MS } from '../bridge/constants.ts';
import { encodeApprovalValue, stateKey, threadOf } from '../bridge/helpers.ts';
import type { ChatApprovalRef, ChatTarget } from '../bridge/types.ts';
import { NOTIFICATION_BODY_MAX_LENGTH } from './constants.ts';

type ChatNotifierInput = {
    name: string;
    chat: Chat<any>;
    approvalUrl?: (ref: ChatApprovalRef) => string;
    target?: ChatTarget;
};

function cut(text: string): string {
    if (text.length <= NOTIFICATION_BODY_MAX_LENGTH) return text;
    return `${text.slice(0, NOTIFICATION_BODY_MAX_LENGTH)}… (cut, ${text.length - NOTIFICATION_BODY_MAX_LENGTH} more characters)`;
}

function approvalCard(n: Notification, opts: NotifyOptions, approvalUrl: ChatNotifierInput['approvalUrl']): CardElement {
    const approvalId = n.approvalId!;
    const value = encodeApprovalValue(n.runId, approvalId);
    const buttons = [
        Button({
            id: APPROVE_ACTION_ID,
            label: 'Approve',
            style: 'primary',
            value,
        }),
        Button({
            id: DENY_ACTION_ID,
            label: 'Deny',
            style: 'danger',
            value,
        }),
    ];
    const url = approvalUrl?.({
        runId: n.runId,
        approvalId,
        agent: n.agent,
    });
    return Card({
        title: n.title,
        children: [
            CardText(cut(n.body)),
            CardText(n.expiresAt ? `Waiting for approval until ${n.expiresAt.toISOString()}.` : 'Waiting for approval.'),
            Actions(url ? [...buttons, LinkButton({ url, label: 'Open in chamvi' })] : buttons),
            CardText(`Run ${n.runId} of agent ${n.agent} (${opts.trigger.source}).`),
        ],
    });
}

/**
 * Posts notifications into the run's thread, or `target` for runs no chat
 * message started. Approval cards carry Approve and Deny buttons with the
 * run and approval ids, never the resume token. Idempotent on the key
 * through the Chat SDK state adapter.
 */
export function createChatNotifier(input: ChatNotifierInput): INotifier {
    return {
        name: input.name,
        async notify(n, opts) {
            const threadId = threadOf(opts.trigger, input.name);
            if (!threadId && !input.target) {
                throw new InvalidAgentDefinitionError(`The chat notifier "${input.name}" has no thread for run ${n.runId}: set a target.`);
            }

            // idempotent; outside a webhook (a cron run's notification) nothing else connects the state
            await input.chat.initialize();
            const state = input.chat.getState();
            const key = stateKey('notify', input.name, opts.idempotencyKey);
            if (await state.get(key)) return;

            const message = n.kind === 'approval' && n.approvalId ?
                approvalCard(n, opts, input.approvalUrl) :
                `**${n.title}**\n\n${cut(n.body)}`;

            if (threadId) {
                await input.chat.thread(threadId).post(message);
            } else if (input.target && 'threadId' in input.target) {
                await input.chat.thread(input.target.threadId).post(message);
            } else if (input.target) {
                await input.chat.channel(input.target.channelId).post(message);
            }

            await state.set(key, true, STATE_TTL_MS);
        },
    };
}
