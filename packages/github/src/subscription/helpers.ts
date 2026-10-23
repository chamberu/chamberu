/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ChannelSubscription } from '@chamvi/core';
import { REPO_PATTERN } from '../tools/constants.ts';
import type { GithubEvent } from './types.ts';

const REPO = new RegExp(REPO_PATTERN);

function matchesEvent(spec: string, event: GithubEvent): boolean {
    const [name, action] = spec.split('.');
    if (name !== event.name) return false;
    return action === undefined || action === event.action;
}

/** True for a positive safe integer. */
export function isPositiveInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

/** True for `owner/name` as the tools accept it. */
export function isRepo(value: unknown): value is string {
    return typeof value === 'string' && REPO.test(value);
}

/**
 * True when `subscription` belongs to the channel `channel` and its events
 * name the delivery's event (and action) and its `filter`, if any, accepts
 * it. A throwing filter propagates (the channel reports it as that agent's
 * failure).
 */
export function matchesGithubSubscription(subscription: ChannelSubscription, channel: string, event: GithubEvent): boolean {
    if (subscription.channel !== channel) return false;
    const events = subscription.options.events as readonly string[] | undefined;
    if (!Array.isArray(events) || events.every((spec) => !matchesEvent(spec, event))) return false;
    const filter = subscription.options.filter as ((event: GithubEvent) => boolean) | undefined;
    return filter ? filter(event) : true;
}

/** `<full_name>#<issue or pull request number>`, else `<full_name>`, else none. */
export function defaultConcurrencyKey(event: GithubEvent): string | undefined {
    const repo = event.payload.repository?.full_name;
    if (typeof repo !== 'string' || repo.length === 0) return undefined;
    const number = event.payload.issue?.number ?? event.payload.pull_request?.number;
    return typeof number === 'number' ? `${repo}#${number}` : repo;
}

/** The address of the event's issue or pull request (`<full_name>#<n>`), if it names one. */
export function eventAddress(event: GithubEvent): string | undefined {
    const repo = event.payload.repository?.full_name;
    const number = event.payload.issue?.number ?? event.payload.pull_request?.number;
    return isRepo(repo) && isPositiveInteger(number) ? `${repo}#${number}` : undefined;
}
