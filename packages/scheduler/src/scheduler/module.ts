/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { hostname } from 'node:os';
import { pid } from 'node:process';
import type { Agent, AgentChange } from '@chamvi/core';
import { defineScheduledComponent } from 'hubwire';
import { readCronOptions } from '../tick/index.ts';
import { createStoreScheduleLock } from '../lock/index.ts';
import { SCHEDULE_LOCK_TTL_MS } from './constants.ts';
import { buildAgentComponents, selectAgents, toDefinitionError } from './helpers.ts';
import type { IScheduler, SchedulerOptions } from './types.ts';

/**
 * Throws InvalidAgentDefinitionError for a cron trigger of the agent hubwire
 * cannot schedule (an expression croner refuses, a timezone, an expression
 * without a future run), like createScheduler does; schedules nothing.
 */
export function assertSchedulable(agent: Agent): void {
    for (const trigger of agent.definition.triggers ?? []) {
        if (trigger.source !== 'cron') continue;
        try {
            const { expression, timezone } = readCronOptions(agent, trigger);
            defineScheduledComponent({
                name: `cron:${agent.name}:${trigger.id}`,
                schedule: expression,
                timezone,
                run: async () => {},
            });
        } catch (e) {
            throw toDefinitionError(agent, trigger, e);
        }
    }
}

/**
 * Schedules every cron trigger of the engine's agents (or of `agents`) as one hubwire component,
 * guarded by a per-tick lock in the engine's store, so replicas sharing the
 * store dispatch each tick once. Validates every trigger up front: throws
 * InvalidAgentDefinitionError for a trigger hubwire cannot schedule or a name
 * in `agents` the engine lacks; a folder agent's (one with a revision) goes to
 * `onError` instead and leaves that agent unscheduled.
 * Follows the engine's `agents.changed` events (only for the names in `agents`
 * when given): an added agent is scheduled, a replaced one rescheduled, a
 * removed one unscheduled; a replacement hubwire cannot schedule goes to
 * `onError` and leaves the agent unscheduled.
 * Shutdown order: `await scheduler.stop()`, then `await engine.drain()`.
 */
export function createScheduler(opts: SchedulerOptions): IScheduler {
    const agents = selectAgents(opts.engine, opts.agents);
    const filter = opts.agents === undefined ? undefined : new Set(opts.agents);
    const ctx = {
        engine: opts.engine,
        lock: createStoreScheduleLock(opts.engine.store, opts.owner ?? `${hostname()}-${pid}`),
        lockTtlMs: opts.lockTtlMs ?? SCHEDULE_LOCK_TTL_MS,
        // eslint-disable-next-line no-console
        onError: opts.onError ?? ((error, errorCtx) => console.error('[chamvi]', error, errorCtx)),
    } satisfies Parameters<typeof buildAgentComponents>[0];

    type Scheduled = ReturnType<typeof buildAgentComponents>;
    const byAgent = new Map<string, Scheduled>();
    for (const agent of agents) {
        // a folder agent (one with a revision) never fails the scheduler: it was checked before it was registered
        const folder = opts.engine.agentRevision(agent.name) !== undefined;
        byAgent.set(agent.name, buildAgentComponents(ctx, agent, folder ? ctx.onError : undefined));
    }

    let started = false;
    let stopped = false;
    // stops of replaced and removed agents' components, awaited by stop()
    const pending = new Set<Promise<void>>();

    const retire = (agent: string, scheduled: Scheduled) => {
        for (const { trigger, component } of scheduled) {
            const settle = component.stop()
                .then(() => component.settled())
                .catch((error: unknown) => ctx.onError(error, { agent, trigger }))
                .finally(() => pending.delete(settle));
            pending.add(settle);
        }
    };

    const onChange = (change: AgentChange) => {
        if (stopped || (filter && !filter.has(change.name))) return;
        const previous = byAgent.get(change.name);
        byAgent.delete(change.name);
        if (previous) retire(change.name, previous);
        if (change.kind === 'removed') return;

        const agent = opts.engine.getAgent(change.name);
        if (!agent) return;
        const scheduled = buildAgentComponents(ctx, agent, ctx.onError);
        byAgent.set(agent.name, scheduled);
        if (!started) return;
        for (const { trigger, component } of scheduled) {
            component.start().catch((error: unknown) => ctx.onError(error, { agent: agent.name, trigger }));
        }
    };
    const unsubscribe = opts.engine.on('agents.changed', onChange);

    const all = () => Array.from(byAgent.values()).flat().map(({ component }) => component);

    return {
        async start() {
            if (started || stopped) return;
            started = true;
            await Promise.all(all().map((c) => c.start()));
        },
        async stop() {
            if (!stopped) {
                stopped = true;
                unsubscribe();
            }
            const components = all();
            await Promise.all(components.map((c) => c.stop()));
            await Promise.all([...components.map((c) => c.settled()), ...pending]);
        },
    };
}
