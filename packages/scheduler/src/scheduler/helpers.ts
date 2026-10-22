/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError } from '@chamvi/core';
import type { Agent, Engine, TriggerDefinition } from '@chamvi/core';
import type { IScheduleLock, IScheduledComponent, ScheduledComponentOptions } from 'hubwire';
import { defineScheduledComponent } from 'hubwire';
import { fireCronTrigger, readCronOptions } from '../tick/index.ts';
import type { SchedulerErrorContext, SchedulerOptions } from './types.ts';

type ComponentContext = Required<Pick<SchedulerOptions, 'engine' | 'lockTtlMs' | 'onError'>> & { lock: IScheduleLock };

/**
 * The hubwire component options for one cron trigger. hubwire's onSkip is not
 * wired: on N replicas, N - 1 skip every tick.
 */
export function buildComponentOptions(
    ctx: ComponentContext,
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
 * One hubwire component per cron trigger of the agent, with the trigger's id. A trigger hubwire
 * cannot schedule throws InvalidAgentDefinitionError, or, with `onInvalid`,
 * is reported there and the agent gets no components at all.
 */
export function buildAgentComponents(
    ctx: ComponentContext,
    agent: Agent,
    onInvalid?: (error: InvalidAgentDefinitionError, errorCtx: SchedulerErrorContext) => void,
): Array<{ trigger: string; component: IScheduledComponent }> {
    const components: Array<{ trigger: string; component: IScheduledComponent }> = [];
    for (const trigger of agent.definition.triggers ?? []) {
        if (trigger.source !== 'cron') continue;
        try {
            components.push({ trigger: trigger.id, component: defineScheduledComponent(buildComponentOptions(ctx, agent, trigger)) });
        } catch (e) {
            const error = e instanceof InvalidAgentDefinitionError ?
                e :
                new InvalidAgentDefinitionError(
                    `Agent "${agent.name}" trigger "${trigger.id}": ${e instanceof Error ? e.message : String(e)}`,
                );
            if (!onInvalid) throw error;
            onInvalid(error, { agent: agent.name, trigger: trigger.id });
            return [];
        }
    }
    return components;
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
