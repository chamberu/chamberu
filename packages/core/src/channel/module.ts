/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ChannelNotFoundError } from '../errors/index.ts';
import type { StateSchema } from '../state/types.ts';
import type { ToolContext } from '../tool/types.ts';
import { createChannelHandle } from './helpers.ts';
import type { ChannelHandle } from './types.ts';

/**
 * The engine's channel `name` bound to this execution's run, for a tool to
 * emit through. On the run's source channel the handle defaults to the
 * source address. Throws ChannelNotFoundError for a channel `ctx.engine`
 * does not have or one without `out`, and for a context without an engine.
 */
export function injectChannel<S extends StateSchema = StateSchema>(ctx: ToolContext<S>, name: string): ChannelHandle {
    const channel = ctx.engine?.getChannel(name);
    if (!channel || typeof channel.out !== 'function') throw new ChannelNotFoundError(name);
    const { trigger } = ctx.run;
    const address = trigger.channel === name ? trigger.address : undefined;
    return createChannelHandle(ctx as ToolContext, channel, address);
}

/**
 * The run's source channel bound to the source address ("answer where it
 * came from"), or undefined when that channel has no `out` or the run has no
 * address.
 */
export function replyChannel<S extends StateSchema = StateSchema>(ctx: ToolContext<S>): ChannelHandle | undefined {
    const trigger = ctx.run?.trigger;
    if (!trigger || trigger.address === undefined) return undefined;
    const channel = ctx.engine?.getChannel(trigger.channel);
    if (!channel || typeof channel.out !== 'function') return undefined;
    return createChannelHandle(ctx as ToolContext, channel, trigger.address);
}
