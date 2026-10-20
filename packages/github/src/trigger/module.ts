/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError } from '@chamberu/core';
import type { TriggerDefinition } from '@chamberu/core';
import { GITHUB_EVENT_PATTERN } from './constants.ts';
import { defaultConcurrencyKey } from './helpers.ts';
import type { GithubEvent, GithubWebhookTriggerOptions } from './types.ts';

/**
 * A GitHub App webhook trigger (envelope `source: 'github'`, payload a
 * `GithubEvent`), matched by event name and optional action
 * (`'issues'`, `'issues.opened'`). Served by the app's `webhookRoute()`.
 */
export function githubWebhook(options: GithubWebhookTriggerOptions): TriggerDefinition<GithubEvent> {
    const events = Array.isArray(options.events) ? [...options.events] as string[] : [];
    if (events.length === 0) {
        throw new InvalidAgentDefinitionError('githubWebhook() needs at least one event.');
    }
    for (const spec of events) {
        if (typeof spec !== 'string' || !GITHUB_EVENT_PATTERN.test(spec)) {
            throw new InvalidAgentDefinitionError(`GitHub event "${String(spec)}" must look like "issues" or "issues.opened".`);
        }
    }
    const id = options.id ?? `github:${events.join(',')}`;
    if (typeof id !== 'string' || id.length === 0) {
        throw new InvalidAgentDefinitionError('A githubWebhook() id must not be empty.');
    }

    const definition: TriggerDefinition<GithubEvent> = {
        source: 'github',
        id,
        options: options.filter ? { events, filter: options.filter } : { events },
        concurrencyKey: options.concurrencyKey ?? defaultConcurrencyKey,
    };
    if (options.idempotencyKey) definition.idempotencyKey = options.idempotencyKey;
    return definition;
}
