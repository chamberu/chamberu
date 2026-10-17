/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { hostname } from 'node:os';
import { pid } from 'node:process';
import { InvalidAgentDefinitionError } from '@chamberu/core';
import type { IScheduledComponent } from 'hubwire';
import { defineScheduledComponent } from 'hubwire';
import { createStoreScheduleLock } from '../lock/index.ts';
import { SCHEDULE_LOCK_TTL_MS } from './constants.ts';
import { buildComponentOptions } from './helpers.ts';
import type { IScheduler, SchedulerOptions } from './types.ts';

/**
 * Schedules every cron trigger of `agents` as one hubwire component, guarded by
 * a per-tick lock in the store, so replicas sharing the store dispatch each tick
 * once. Validates every trigger up front: throws InvalidAgentDefinitionError
 * for a duplicate agent name or a trigger hubwire cannot schedule.
 * Shutdown order: `await scheduler.stop()`, then `await engine.drain()`.
 */
export function createScheduler(opts: SchedulerOptions): IScheduler {
    const names = new Set<string>();
    for (const agent of opts.agents) {
        if (names.has(agent.name)) {
            throw new InvalidAgentDefinitionError(`Agent name "${agent.name}" is used more than once.`);
        }
        names.add(agent.name);
    }

    const ctx = {
        engine: opts.engine,
        store: opts.store,
        lock: createStoreScheduleLock(opts.store, opts.owner ?? `${hostname()}-${pid}`),
        lockTtlMs: opts.lockTtlMs ?? SCHEDULE_LOCK_TTL_MS,
        // eslint-disable-next-line no-console
        onError: opts.onError ?? ((error, errorCtx) => console.error('[chamberu]', error, errorCtx)),
    } satisfies Parameters<typeof buildComponentOptions>[0];

    const components: IScheduledComponent[] = [];
    for (const agent of opts.agents) {
        for (const trigger of agent.definition.triggers ?? []) {
            if (trigger.source !== 'cron') continue;
            try {
                components.push(defineScheduledComponent(buildComponentOptions(ctx, agent, trigger)));
            } catch (e) {
                if (e instanceof InvalidAgentDefinitionError) throw e;
                throw new InvalidAgentDefinitionError(
                    `Agent "${agent.name}" trigger "${trigger.id}": ${e instanceof Error ? e.message : String(e)}`,
                );
            }
        }
    }

    return {
        async start() {
            await Promise.all(components.map((c) => c.start()));
        },
        async stop() {
            await Promise.all(components.map((c) => c.stop()));
            await Promise.all(components.map((c) => c.settled()));
        },
    };
}
