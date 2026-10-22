/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Engine } from '../engine/module.ts';
import { InvalidAgentDefinitionError } from '../errors/index.ts';
import { NAME_MAX_LENGTH, NAME_PATTERN } from '../agent/constants.ts';
import type { ChannelContext, IChannel } from './types.ts';

/** The context a channel's `start` and `in` get: its dispatch always carries the channel's own name. */
export function createChannelContext(engine: Engine, channel: Pick<IChannel, 'name'>): ChannelContext {
    return {
        engine,
        dispatch: (envelope) => engine.dispatch({ ...envelope, channel: channel.name }),
    };
}

/** Refuses a channel name that breaks the agent-name rules. */
export function assertChannelName(name: unknown): asserts name is string {
    if (typeof name !== 'string' || name.length > NAME_MAX_LENGTH || !NAME_PATTERN.test(name)) {
        throw new InvalidAgentDefinitionError(
            `Invalid channel name "${String(name)}": must match ${NAME_PATTERN} and be at most ${NAME_MAX_LENGTH} characters.`,
        );
    }
}
