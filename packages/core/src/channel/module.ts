/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { channelsOf } from '../context/helpers.ts';
import { ChannelNotFoundError, ErrorCode, ValidationError } from '../errors/index.ts';
import type { StateSchema } from '../state/types.ts';
import type { ToolContext } from '../tool/types.ts';
import { createChannelHandle } from './helpers.ts';
import type { ChannelHandle, ReadRequestBodyOptions } from './types.ts';

const tooLarge = (limit: number) => new ValidationError(
    `The request body is larger than ${limit} bytes.`,
    [],
    ErrorCode.PAYLOAD_TOO_LARGE,
);

/**
 * Reads a request body of at most `limit` bytes: a `content-length` above
 * it is refused unread, a body without one is read until it passes the
 * limit. Refusals are a ValidationError with code `payload_too_large`
 * (an http app answers 413). Media-type checks stay with the caller.
 */
export async function readRequestBody(request: Request, options: ReadRequestBodyOptions): Promise<Uint8Array> {
    const { limit } = options;
    const length = request.headers.get('content-length');
    if (length !== null && /^\d+$/.test(length) && Number(length) > limit) throw tooLarge(limit);
    if (!request.body) return new Uint8Array();

    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > limit) throw tooLarge(limit);
            chunks.push(value);
        }
    } catch (error) {
        await reader.cancel().catch(() => {});
        throw error;
    } finally {
        reader.releaseLock();
    }

    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}

/**
 * The engine's channel `name` bound to this execution's run, for a tool to
 * emit through. On the run's source channel the handle defaults to the
 * source address. Throws ChannelNotFoundError for a channel the engine does
 * not have or one without `out`, and for a context the engine did not pass.
 */
export function injectChannel<S extends StateSchema = StateSchema>(ctx: ToolContext<S>, name: string): ChannelHandle {
    const binding = channelsOf(ctx);
    const channel = binding?.channels.get(name);
    if (!binding || !channel || typeof channel.out !== 'function') throw new ChannelNotFoundError(name);
    const { trigger } = ctx.run;
    const address = trigger.channel === name ? trigger.address : undefined;
    return createChannelHandle(ctx as ToolContext, binding, channel, address);
}

/**
 * The run's source channel bound to the source address ("answer where it
 * came from"), or undefined when that channel has no `out` or the run has no
 * address.
 */
export function replyChannel<S extends StateSchema = StateSchema>(ctx: ToolContext<S>): ChannelHandle | undefined {
    const binding = channelsOf(ctx);
    const trigger = ctx.run?.trigger;
    if (!binding || !trigger || trigger.address === undefined) return undefined;
    const channel = binding.channels.get(trigger.channel);
    if (!channel || typeof channel.out !== 'function') return undefined;
    return createChannelHandle(ctx as ToolContext, binding, channel, trigger.address);
}
