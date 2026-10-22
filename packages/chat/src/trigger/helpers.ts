/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { TriggerDefinition } from '@chamvi/core';
import type { ChatEventKind, ChatPayload } from './types.ts';

type ChatTriggerOptionsRecord = {
    channel: string;
    on: ChatEventKind[];
    adapters?: string[];
    filter?: (payload: ChatPayload) => boolean;
};

/** Whether `trigger` is a chatTrigger() of this bridge that takes `payload`. */
export function matchesChatTrigger(trigger: TriggerDefinition, payload: ChatPayload): boolean {
    if (trigger.source !== 'channel') return false;
    const options = trigger.options as ChatTriggerOptionsRecord;
    if (options.channel !== payload.channel) return false;
    if (!options.on.includes(payload.event)) return false;
    if (options.adapters && !options.adapters.includes(payload.adapter)) return false;
    return options.filter ? options.filter(payload) : true;
}
