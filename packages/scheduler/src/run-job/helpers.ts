/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Agent, RunStatusLiteral, TriggerDefinition } from '@chamberu/core';
import { InvalidAgentDefinitionError } from '@chamberu/core';

/** Statuses a job returns on: the run finished or waits for a human. */
export const SETTLING: RunStatusLiteral[] = ['completed', 'failed', 'cancelled', 'waiting'];

/**
 * The cron trigger a job fires: `triggerId`, or the agent's only cron trigger.
 * Throws InvalidAgentDefinitionError when it is missing or ambiguous.
 */
export function resolveCronTrigger(agent: Agent, triggerId?: string): TriggerDefinition {
    const crons = (agent.definition.triggers ?? []).filter((t) => t.source === 'cron');
    if (triggerId !== undefined) {
        const trigger = crons.find((t) => t.id === triggerId);
        if (!trigger) {
            throw new InvalidAgentDefinitionError(`Agent "${agent.name}" has no cron trigger "${triggerId}".`);
        }
        return trigger;
    }
    if (crons.length !== 1) {
        throw new InvalidAgentDefinitionError(
            `Agent "${agent.name}" has ${crons.length} cron triggers; pass the trigger id.`,
        );
    }
    return crons[0] as TriggerDefinition;
}
