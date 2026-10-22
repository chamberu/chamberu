/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomUUID } from 'node:crypto';
import { InvalidRunStateError } from '../../errors/index.ts';
import { AGENT_LOCK_TTL_MS } from '../constants.ts';
import type { RegistryContext } from './types.ts';

function delay(ctx: RegistryContext, ms: number): Promise<void> {
    return new Promise((resolve) => {
        ctx.clock.setTimeout(resolve, ms);
    });
}

/**
 * Runs `fn` under the store lock `agents:<name>`, retried every
 * claimTtlMs / 3 on the clock; gives up after AGENT_LOCK_TTL_MS with
 * InvalidRunStateError.
 */
export async function withAgentLock<T>(ctx: RegistryContext, name: string, fn: () => Promise<T>): Promise<T> {
    const key = `agents:${name}`;
    const owner = randomUUID();
    const deadline = ctx.clock.now().getTime() + AGENT_LOCK_TTL_MS;
    while (!await ctx.store.acquire(key, owner, AGENT_LOCK_TTL_MS)) {
        if (ctx.clock.now().getTime() >= deadline) {
            throw new InvalidRunStateError(`The registry lock of agent "${name}" was not released within ${AGENT_LOCK_TTL_MS}ms.`);
        }
        await delay(ctx, ctx.claimTtlMs / 3);
    }
    try {
        return await fn();
    } finally {
        await ctx.store.release(key, owner).catch((error: unknown) => ctx.onError(error));
    }
}
