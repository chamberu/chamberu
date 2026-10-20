/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { InvalidAgentDefinitionError, cron, defineAgent } from '@chamberu/core';
import { githubWebhook } from '@chamberu/github';
import type { GithubEvent } from '@chamberu/github';
import { defaultConcurrencyKey, matchesGithubTrigger } from '../../../src/trigger/helpers.ts';
import { textModel } from '../../utils/model.ts';

function event(overrides: Partial<GithubEvent> = {}): GithubEvent {
    return {
        name: 'issues',
        action: 'opened',
        delivery: 'd-1',
        installationId: 42,
        payload: {
            action: 'opened',
            repository: { full_name: 'o/r' },
            issue: { number: 5 },
        },
        ...overrides,
    };
}

describe('githubWebhook', () => {
    it('builds a github trigger', () => {
        const trigger = githubWebhook({ events: ['issues.opened', 'pull_request'] });
        expect(trigger.source).toBe('github');
        expect(trigger.id).toBe('github:issues.opened,pull_request');
        expect(trigger.options.events).toEqual(['issues.opened', 'pull_request']);
        expect(trigger).not.toHaveProperty('idempotencyKey');
        expect(trigger.concurrencyKey).toBeTypeOf('function');
    });

    it('takes an explicit id', () => {
        expect(githubWebhook({ id: 'github:triage', events: ['issues'] }).id).toBe('github:triage');
    });

    it('copies the events', () => {
        const events = ['issues'];
        const trigger = githubWebhook({ events });
        events.push('pull_request');
        expect(trigger.options.events).toEqual(['issues']);
    });

    it('accepts event names with digits (Projects v2)', () => {
        const trigger = githubWebhook({ events: ['projects_v2_item.created', 'projects_v2'] });
        expect(trigger.options.events).toEqual(['projects_v2_item.created', 'projects_v2']);
    });

    it.each([
        [[]],
        [['Issues']],
        [['issues.']],
        [['a.b.c']],
        [['']],
        [['issues opened']],
    ])('refuses the events %j', (events) => {
        expect(() => githubWebhook({ events })).toThrow(InvalidAgentDefinitionError);
    });

    it('refuses an empty id', () => {
        expect(() => githubWebhook({ id: '', events: ['issues'] })).toThrow(InvalidAgentDefinitionError);
    });

    it('keeps the given idempotency key function', () => {
        const trigger = githubWebhook({ events: ['issues'], idempotencyKey: (e) => `issue:${e.payload.issue?.number}` });
        expect(trigger.idempotencyKey?.(event())).toBe('issue:5');
    });
});

describe('matchesGithubTrigger', () => {
    it('matches name and action', () => {
        const opened = githubWebhook({ events: ['issues.opened'] });
        expect(matchesGithubTrigger(opened, event())).toBe(true);
        expect(matchesGithubTrigger(opened, event({ action: 'closed' }))).toBe(false);
        expect(matchesGithubTrigger(opened, event({ name: 'issue_comment', action: 'opened' }))).toBe(false);
        expect(matchesGithubTrigger(opened, event({ action: undefined }))).toBe(false);
    });

    it('matches any action of a bare event name', () => {
        const issues = githubWebhook({ events: ['issues'] });
        expect(matchesGithubTrigger(issues, event({ action: 'closed' }))).toBe(true);
        expect(matchesGithubTrigger(issues, event({ name: 'ping', action: undefined }))).toBe(false);
    });

    it('matches any of several events', () => {
        const trigger = githubWebhook({ events: ['issues.opened', 'pull_request'] });
        expect(matchesGithubTrigger(trigger, event({ name: 'pull_request', action: 'synchronize' }))).toBe(true);
    });

    it('never matches a trigger of another source', () => {
        expect(matchesGithubTrigger(cron('0 * * * *'), event())).toBe(false);
        const forged = { ...githubWebhook({ events: ['issues'] }), source: 'webhook' as const };
        expect(matchesGithubTrigger(forged, event())).toBe(false);
    });

    it('applies the filter after the event match', () => {
        const seen: GithubEvent[] = [];
        const trigger = githubWebhook({
            events: ['issues.opened'],
            filter: (e) => {
                seen.push(e);
                return e.payload.issue?.number === 5;
            },
        });
        expect(matchesGithubTrigger(trigger, event({ action: 'closed' }))).toBe(false);
        expect(seen).toHaveLength(0);
        expect(matchesGithubTrigger(trigger, event())).toBe(true);
        expect(matchesGithubTrigger(trigger, event({ payload: { issue: { number: 6 } } }))).toBe(false);
        expect(seen).toHaveLength(2);
    });

    it('propagates a throwing filter', () => {
        const trigger = githubWebhook({
            events: ['issues'],
            filter: () => {
                throw new TypeError('bad filter');
            },
        });
        expect(() => matchesGithubTrigger(trigger, event())).toThrow('bad filter');
    });
});

describe('default concurrency key', () => {
    it('keys issues and pull requests by repository and number', () => {
        expect(defaultConcurrencyKey(event())).toBe('o/r#5');
        expect(defaultConcurrencyKey(event({
            name: 'pull_request',
            payload: { repository: { full_name: 'o/r' }, pull_request: { number: 7 } },
        }))).toBe('o/r#7');
    });

    it('falls back to the repository, then to none', () => {
        expect(defaultConcurrencyKey(event({ payload: { repository: { full_name: 'o/r' } } }))).toBe('o/r');
        expect(defaultConcurrencyKey(event({ payload: {} }))).toBeUndefined();
    });

    it('is the trigger default, and a given concurrencyKey wins', () => {
        expect(githubWebhook({ events: ['issues'] }).concurrencyKey?.(event())).toBe('o/r#5');
        const own = githubWebhook({ events: ['issues'], concurrencyKey: () => 'mine' });
        expect(own.concurrencyKey?.(event())).toBe('mine');
    });
});

describe('agents', () => {
    it('accept two github triggers with distinct ids and refuse equal ones', () => {
        const base = {
            name: 'triage', 
            model: textModel(), 
            instructions: 'Triage.', 
        };
        expect(() => defineAgent({
            ...base,
            triggers: [
                githubWebhook({ events: ['issues.opened'] }),
                githubWebhook({ id: 'github:other', events: ['issues.opened'] }),
            ],
        })).not.toThrow();
        expect(() => defineAgent({
            ...base,
            triggers: [
                githubWebhook({ events: ['issues.opened'] }),
                githubWebhook({ events: ['issues.opened'] }),
            ],
        })).toThrow(InvalidAgentDefinitionError);
    });
});
