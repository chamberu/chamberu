/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Agent, OverlapPolicy, TriggerDefinition } from '@chamvi/core';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import { isOverlapping } from './helpers.ts';
import type { CronTickContext, CronTickResult, CronTriggerOptions } from './types.ts';

const OVERLAP_POLICIES: OverlapPolicy[] = ['skip', 'queue-one', 'allow'];

/**
 * Reads the options `cron()` stores on a trigger. Throws
 * InvalidAgentDefinitionError for a trigger that is not a well-formed cron trigger.
 */
export function readCronOptions(agent: Agent, trigger: TriggerDefinition): CronTriggerOptions {
    const fail = (reason: string) => new InvalidAgentDefinitionError(
        `Agent "${agent.name}" trigger "${trigger.id}": ${reason}`,
    );
    if (trigger.source !== 'cron') throw fail(`is a ${trigger.source} trigger, not a cron trigger.`);

    const {
        expression,
        timezone,
        overlap = 'skip',
        payload,
    } = trigger.options;
    if (typeof expression !== 'string') throw fail('has no cron expression.');
    if (timezone !== undefined && typeof timezone !== 'string') throw fail('has an invalid timezone.');
    if (!OVERLAP_POLICIES.includes(overlap as OverlapPolicy)) {
        throw fail(`has an unknown overlap policy "${String(overlap)}".`);
    }

    return {
        expression,
        timezone,
        overlap: overlap as OverlapPolicy,
        payload,
    };
}

/**
 * Fires one tick of a cron trigger: applies the overlap policy, then dispatches
 * with the idempotency key `<triggerId>@<scheduledAt ISO>`, so a second firing
 * of the same tick (another replica, a retry) is deduplicated. The trigger's own
 * idempotencyKey() is ignored. Without a concurrencyKey() on the trigger, the run
 * is keyed by the trigger id under `skip` and `queue-one` (so a queued run waits
 * behind the active one) and not keyed under `allow`.
 */
export async function fireCronTrigger(ctx: CronTickContext): Promise<CronTickResult> {
    const {
        engine,
        agent,
        trigger,
        scheduledAt,
    } = ctx;
    const options = readCronOptions(agent, trigger);

    if (await isOverlapping(engine.store, agent.name, trigger.id, options.overlap)) {
        return { dispatched: false, reason: 'overlap' };
    }

    const iso = scheduledAt.toISOString();
    const payload = options.payload ?? { scheduledAt: iso };
    const result = await engine.dispatch({
        agent: agent.name,
        trigger: trigger.id,
        source: 'cron',
        payload,
        idempotencyKey: `${trigger.id}@${iso}`,
        concurrencyKey: trigger.concurrencyKey?.(payload) ??
            (options.overlap === 'allow' ? undefined : trigger.id),
    });
    return { dispatched: true, ...result };
}
