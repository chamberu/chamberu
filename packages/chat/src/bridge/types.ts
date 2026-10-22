/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Engine, INotifier, Invoker } from '@chamvi/core';
import type { HttpRoute } from '@chamvi/http';
import type { ToolSet } from 'ai';
import type { Author, Chat } from 'chat';

export type ChatApprovalRef = {
    runId: string;
    approvalId: string;
    agent: string;
};

/** Where notifications of runs a chat message did not start go. */
export type ChatTarget = { threadId: string } | { channelId: string };

export type ChatBridgeOptions = {
    /** A configured Chat SDK instance: adapters and a state adapter (`@chat-adapter/state-pg` shares chamvi's Postgres). */
    chat: Chat<any>;
    /** Default 'chat'; chatTrigger({ channel }) and the notifier name refer to it. */
    name?: string;
    /** Default `/channels/<name>`; each adapter gets `POST <pathPrefix>/<adapter>`. */
    pathPrefix?: string;
    /**
     * Maps a platform user to an invoker (identity and grants). It is the
     * only source of an invoker: without it, chat runs carry none and
     * approval buttons are refused, so approvals are answered in the UI.
     */
    resolveInvoker?: (author: Author, context: { adapter: string }) => Invoker | undefined | Promise<Invoker | undefined>;
    /** Earlier thread messages put into the payload; default 20, 0 turns it off. */
    history?: number;
    /** A link next to the approval buttons, e.g. into the chamvi UI (ids only, never the token). */
    approvalUrl?: (ref: ChatApprovalRef) => string;
    /** Notifications of runs a chat message did not start (cron, http) go here. */
    target?: ChatTarget;
    /** Default `console.error`. */
    onError?: (error: unknown) => void;
};

export interface IChatBridge {
    readonly name: string;
    /** Approval cards in the run's thread (or `target`); name it in an agent's `notify`. */
    readonly notifier: INotifier;
    /** One webhook route per adapter, for `createHttpApp({ routes })`. */
    routes(): HttpRoute[];
    /** `chat_reply`: posts into the run's thread, at most once per input. */
    tools(): ToolSet;
    /** Registers the Chat SDK handlers that dispatch runs and answer approvals. Call once. */
    attach(engine: Engine): void;
}
