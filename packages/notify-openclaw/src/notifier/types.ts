/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock } from '@chamvi/core';

// #region public
/** Where OpenClaw delivers the agent turn's answer; both `channel` and `to` are concrete. */
export type OpenclawDelivery = {
    /** E.g. `telegram`, `slack`, `whatsapp`; `last` is refused by OpenClaw for hooks. */
    channel: string;
    /** The recipient on that channel (chat id, user, number). */
    to: string;
    /** Selects one of several accounts of the channel. */
    accountId?: string;
};

export type OpenclawNotifierOptions = {
    /** Default `'openclaw'`. */
    name?: string;
    /** The OpenClaw gateway, e.g. `http://openclaw:18789`; a base path is kept. */
    baseUrl: string;
    /** OpenClaw's `hooks.token` (a hook-dedicated token, not the gateway token). */
    hooksToken: string;
    /** OpenClaw's `hooks.path`, default `/hooks`. */
    hooksPath?: string;
    /** The OpenClaw agent that phrases the message (must be in `hooks.allowedAgentIds` when set). */
    agentId?: string;
    deliver: OpenclawDelivery;
    /** A link that answers an approval (the chamvi UI); holds the token. */
    resumeUrl?: (token: string) => string;
    /** Default `OPENCLAW_TIMEOUT_MS` (30 s). */
    timeoutMs?: number;
    clock?: IClock;
    fetch?: typeof globalThis.fetch;
};

/** The body of `POST <hooksPath>/agent`. */
export type OpenclawHookBody = {
    message: string;
    name: 'chamvi';
    agentId?: string;
    deliver: true;
    channel: string;
    to: string;
    accountId?: string;
};
// #endregion public

export type ResolvedOpenclawOptions = {
    name: string;
    url: string;
    hooksToken: string;
    agentId?: string;
    deliver: OpenclawDelivery;
    resumeUrl?: (token: string) => string;
    timeoutMs: number;
    clock: IClock;
    fetch: typeof globalThis.fetch;
};
