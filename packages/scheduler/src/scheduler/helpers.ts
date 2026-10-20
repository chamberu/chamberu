/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError } from '@chamberu/core';
import type { Agent, Engine, TriggerDefinition } from '@chamberu/core';
import type { IScheduleLock, ScheduledComponentOptions } from 'hubwire';
import { fireCronTrigger, readCronOptions } from '../tick/index.ts';
import type { SchedulerOptions } from './types.ts';

/**
 * The hubwire component options for one cron trigger. hubwire's onSkip is not
 * wired: on N replicas, N - 1 skip every tick.
 */
export function buildComponentOptions(
    ctx: Required<Pick<SchedulerOptions, 'engine' | 'lockTtlMs' | 'onError'>> & { lock: IScheduleLock },
    agent: Agent,
    trigger: TriggerDefinition,
): ScheduledComponentOptions {
    const { expression, timezone } = readCronOptions(agent, trigger);
    return {
        name: `cron:${agent.name}:${trigger.id}`,
        schedule: expression,
        timezone,
        lock: ctx.lock,
        lockTtlMs: ctx.lockTtlMs,
        // a start pass never takes the lock: it would fire on every replica on every start
        runOnStart: false,
        run: async ({ scheduledAt }) => {
            await fireCronTrigger({
                engine: ctx.engine,
                agent,
                trigger,
                scheduledAt,
            });
        },
        hooks: { onError: (error) => ctx.onError(error, { agent: agent.name, trigger: trigger.id }) },
    };
}

/**
 * The engine's agents, or only the named ones (in the given order); a name the
 * engine lacks or a name given twice throws InvalidAgentDefinitionError.
 */
export function selectAgents(engine: Engine, names?: readonly string[]): Agent[] {
    if (names === undefined) return engine.listAgents();
    const seen = new Set<string>();
    return names.map((name) => {
        if (seen.has(name)) {
            throw new InvalidAgentDefinitionError(`Agent "${name}" is named more than once.`);
        }
        seen.add(name);
        const agent = engine.getAgent(name);
        if (!agent) {
            throw new InvalidAgentDefinitionError(`The engine has no agent "${name}".`);
        }
        return agent;
    });
}
