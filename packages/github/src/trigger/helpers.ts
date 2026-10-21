/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { TriggerDefinition } from '@chamvi/core';
import type { GithubEvent } from './types.ts';

function matchesEvent(spec: string, event: GithubEvent): boolean {
    const [name, action] = spec.split('.');
    if (name !== event.name) return false;
    return action === undefined || action === event.action;
}

/**
 * True when `trigger` is a `githubWebhook()` trigger whose events name the
 * delivery's event (and action) and whose `filter`, if any, accepts it. A
 * throwing filter propagates (the webhook route reports it as that agent's
 * failure).
 */
export function matchesGithubTrigger(trigger: TriggerDefinition, event: GithubEvent): boolean {
    if (trigger.source !== 'github') return false;
    const events = trigger.options.events as readonly string[] | undefined;
    if (!events?.some((spec) => matchesEvent(spec, event))) return false;
    const filter = trigger.options.filter as ((event: GithubEvent) => boolean) | undefined;
    return filter ? filter(event) : true;
}

/** `<full_name>#<issue or pull request number>`, else `<full_name>`, else none. */
export function defaultConcurrencyKey(event: GithubEvent): string | undefined {
    const repo = event.payload.repository?.full_name;
    if (typeof repo !== 'string' || repo.length === 0) return undefined;
    const number = event.payload.issue?.number ?? event.payload.pull_request?.number;
    return typeof number === 'number' ? `${repo}#${number}` : repo;
}
