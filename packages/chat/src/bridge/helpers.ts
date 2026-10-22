/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createHash } from 'node:crypto';
import { InvalidAgentDefinitionError, TRIGGER_KEY_MAX_LENGTH } from '@chamvi/core';
import type { TriggerEnvelope } from '@chamvi/core';
import type { HttpRouteResult } from '@chamvi/http';
import type { Message, Thread } from 'chat';
import { isObject } from 'smob';
import type { ChatHistoryEntry, ChatPayload } from '../trigger/types.ts';
import {
    DEFAULT_HISTORY,
    HISTORY_MAX,
    HISTORY_TEXT_MAX_LENGTH,
    STATE_KEY_PREFIX,
} from './constants.ts';
import type { ChatApprovalRef } from './types.ts';

/** A trigger key that fits the store: the value itself, or `sha256:<hex>` when longer. */
export function boundKey(value: string): string {
    if (value.length <= TRIGGER_KEY_MAX_LENGTH && !value.includes('\u0000')) return value;
    return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

export function stateKey(...parts: string[]): string {
    return [STATE_KEY_PREFIX, ...parts].join(':');
}

export function resolveHistory(value: number | undefined): number {
    if (value === undefined) return DEFAULT_HISTORY;
    if (!Number.isSafeInteger(value) || value < 0 || value > HISTORY_MAX) {
        throw new InvalidAgentDefinitionError(`A chat bridge history must be an integer from 0 to ${HISTORY_MAX}.`);
    }
    return value;
}

/** Up to `limit` messages before `current`, oldest first (one paginated read of the platform). */
export async function readHistory(thread: Thread<any>, current: Message, limit: number): Promise<ChatHistoryEntry[]> {
    const entries: ChatHistoryEntry[] = [];
    if (limit === 0) return entries;
    for await (const message of thread.messages) {
        if (message.id === current.id) continue;
        entries.push({
            author: message.author.userName,
            text: message.text.slice(0, HISTORY_TEXT_MAX_LENGTH),
            fromBot: message.author.isMe,
        });
        if (entries.length >= limit) break;
    }
    return entries.reverse();
}

/** The Chat SDK thread a run started from, when this bridge started it. */
export function threadOf(trigger: TriggerEnvelope, channel: string): string | undefined {
    if (trigger.source !== 'channel' || !isObject(trigger.payload)) return undefined;
    const payload = trigger.payload as Partial<ChatPayload>;
    if (payload.channel !== channel || typeof payload.threadId !== 'string') return undefined;
    return payload.threadId;
}

export function encodeApprovalValue(runId: string, approvalId: string): string {
    return JSON.stringify({ runId, approvalId });
}

export function decodeApprovalValue(value: string | undefined): Pick<ChatApprovalRef, 'runId' | 'approvalId'> | undefined {
    if (typeof value !== 'string') return undefined;
    try {
        const parsed: unknown = JSON.parse(value);
        if (!isObject(parsed)) return undefined;
        const { runId, approvalId } = parsed as Record<string, unknown>;
        if (typeof runId !== 'string' || typeof approvalId !== 'string') return undefined;
        return { runId, approvalId };
    } catch {
        return undefined;
    }
}

/** A route request rebuilt for the Chat SDK, which verifies signatures on the raw body. */
export function toFetchRequest(request: Request, body: Uint8Array): Request {
    return new Request(request.url, {
        method: request.method,
        headers: request.headers,
        // slice(): a copy typed on ArrayBuffer, which BodyInit wants
        body: body.length > 0 ? body.slice() : undefined,
        signal: request.signal,
    });
}

export async function toRouteResult(response: Response): Promise<HttpRouteResult> {
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
        headers[key] = value;
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    return {
        status: response.status,
        headers,
        body: bytes.length > 0 ? bytes : undefined,
    };
}
