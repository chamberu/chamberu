/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { hostname } from 'node:os';
import { pid } from 'node:process';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import type { IScheduledComponent } from 'hubwire';
import { defineScheduledComponent } from 'hubwire';
import { createStoreScheduleLock } from '../lock/index.ts';
import { SCHEDULE_LOCK_TTL_MS } from './constants.ts';
import { buildComponentOptions, selectAgents } from './helpers.ts';
import type { IScheduler, SchedulerOptions } from './types.ts';

/**
 * Schedules every cron trigger of the engine's agents (or of `agents`) as one hubwire component,
 * guarded by a per-tick lock in the engine's store, so replicas sharing the
 * store dispatch each tick once. Validates every trigger up front: throws
 * InvalidAgentDefinitionError for a trigger hubwire cannot schedule or a name
 * in `agents` the engine lacks.
 * Shutdown order: `await scheduler.stop()`, then `await engine.drain()`.
 */
export function createScheduler(opts: SchedulerOptions): IScheduler {
    const agents = selectAgents(opts.engine, opts.agents);
    const ctx = {
        engine: opts.engine,
        lock: createStoreScheduleLock(opts.engine.store, opts.owner ?? `${hostname()}-${pid}`),
        lockTtlMs: opts.lockTtlMs ?? SCHEDULE_LOCK_TTL_MS,
        // eslint-disable-next-line no-console
        onError: opts.onError ?? ((error, errorCtx) => console.error('[chamvi]', error, errorCtx)),
    } satisfies Parameters<typeof buildComponentOptions>[0];

    const components: IScheduledComponent[] = [];
    for (const agent of agents) {
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
