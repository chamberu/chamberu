/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { defineContextKey } from '@chamvi/core';
import type { ContextKey, INotifier } from '@chamvi/core';

const keys = new Map<string, ContextKey<INotifier>>();

/** The key of the OpenClaw notifier named `name` (`openclaw:<name>`), one per name. */
export function openclawContextKey(name: string): ContextKey<INotifier> {
    let key = keys.get(name);
    if (!key) {
        key = defineContextKey<INotifier>(`openclaw:${name}`);
        keys.set(name, key);
    }
    return key;
}
