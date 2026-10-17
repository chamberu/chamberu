/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    Agent,
    IRunStore,
    Run,
    TriggerDefinition,
} from '@chamberu/core';
import { InvalidAgentDefinitionError } from '@chamberu/core';

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

/**
 * Whether a queued run is held back by a run of its concurrency key that waits
 * for an approval: it starts only once a human answers (or the approval times
 * out), so a job must not wait for it.
 */
export async function isQueuedBehindApproval(store: Pick<IRunStore, 'listRuns'>, run: Run): Promise<boolean> {
    if (run.status !== 'queued' || run.concurrencyKey === undefined) return false;
    const { total } = await store.listRuns({
        agent: run.agent,
        status: ['waiting'],
        concurrencyKey: run.concurrencyKey,
        limit: 1,
    });
    return total > 0;
}
