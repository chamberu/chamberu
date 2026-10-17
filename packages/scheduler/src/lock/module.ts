/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ILockStore } from '@chamberu/core';
import type { IScheduleLock } from 'hubwire';

/**
 * A hubwire schedule lock over core's lock store: the replica that acquires a
 * tick's key runs it. Tick keys are never released (hubwire's contract), so a
 * replica firing the same tick late cannot win it again.
 */
export function createStoreScheduleLock(store: ILockStore, owner: string): IScheduleLock {
    return { acquire: (key, ttlMs) => store.acquire(key, owner, ttlMs) };
}
