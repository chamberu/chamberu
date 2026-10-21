/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import type { GithubEvent } from '@chamvi/github';
import type { GithubNotifierOptions } from '@chamvi/notify-github';
import { resolveOptions, resolveTarget } from '../../../src/notifier/helpers.ts';
import {
    createGithubFixture,
    githubEvent,
    githubTrigger,
    httpTrigger,
} from '../../utils/github.ts';

const TARGET = { repo: 'octo/fallback', number: 3 };

function options(patch: Partial<GithubNotifierOptions> = {}, app: { installationId?: number } = {}) {
    const { gh } = createGithubFixture(app);
    return resolveOptions({ app: gh, ...patch });
}

describe('resolveTarget', () => {
    it('takes the issue of a github run', () => {
        expect(resolveTarget(githubTrigger(), options(), 'r1')).toEqual({
            owner: 'octo',
            repo: 'demo',
            number: 7,
            installationId: 42,
        });
    });

    it('takes the pull request of a github run', () => {
        const event = githubEvent({
            name: 'pull_request',
            payload: {
                repository: { full_name: 'octo/demo' },
                pull_request: { number: 12 },
            },
        });
        expect(resolveTarget(githubTrigger(event), options(), 'r1')).toMatchObject({ number: 12, installationId: 42 });
    });

    it('falls back to the app installation', () => {
        const event = githubEvent({ installationId: undefined });
        expect(resolveTarget(githubTrigger(event), options({}, { installationId: 7 }), 'r1')).toMatchObject({
            number: 7,
            installationId: 7,
        });
    });

    it('falls back to target for an http run', () => {
        expect(resolveTarget(httpTrigger(), options({ target: TARGET }, { installationId: 7 }), 'r1')).toEqual({
            owner: 'octo',
            repo: 'fallback',
            number: 3,
            installationId: 7,
        });
    });

    it('falls back to target for a push event, with the event installation', () => {
        const event = githubEvent({
            name: 'push',
            action: undefined,
            payload: { repository: { full_name: 'octo/demo' } },
        });
        expect(resolveTarget(githubTrigger(event), options({ target: TARGET }), 'r1')).toEqual({
            owner: 'octo',
            repo: 'fallback',
            number: 3,
            installationId: 42,
        });
    });

    it('takes target.installationId for a comment on target', () => {
        const event = githubEvent({
            name: 'push',
            action: undefined,
            payload: { repository: { full_name: 'orga/repo' } },
        });
        const resolved = options({ target: { ...TARGET, installationId: 99 } }, { installationId: 7 });
        expect(resolveTarget(githubTrigger(event), resolved, 'r1')).toEqual({
            owner: 'octo',
            repo: 'fallback',
            number: 3,
            installationId: 99,
        });
        expect(resolveTarget(httpTrigger(), resolved, 'r1')).toMatchObject({ installationId: 99 });
        // the event's own issue keeps the event's installation
        expect(resolveTarget(githubTrigger(), resolved, 'r1')).toMatchObject({ repo: 'demo', installationId: 42 });
    });

    it('needs no app installation with target.installationId', () => {
        expect(resolveTarget(httpTrigger(), options({ target: { ...TARGET, installationId: 99 } }), 'r1')).toMatchObject({ installationId: 99 });
    });

    it.each([
        ['a malformed full_name', { repository: { full_name: 'a/../b' }, issue: { number: 7 } }],
        ['a non-integer number', { repository: { full_name: 'octo/demo' }, issue: { number: '7' } }],
        ['no repository', { issue: { number: 7 } }],
    ])('falls back to target for %s', (_label, payload) => {
        const event = githubEvent({ payload: payload as GithubEvent['payload'] });
        expect(resolveTarget(githubTrigger(event), options({ target: TARGET }), 'r1')).toMatchObject({ repo: 'fallback' });
    });

    it('throws without a target', () => {
        expect(() => resolveTarget(httpTrigger(), options({}, { installationId: 7 }), 'r1')).toThrow(InvalidAgentDefinitionError);
        expect(() => resolveTarget(httpTrigger(), options({}, { installationId: 7 }), 'r1')).toThrow('set target');
        expect(() => resolveTarget(httpTrigger(), options({}, { installationId: 7 }), 'r1')).toThrow('run r1 of agent "release"');
    });

    it('throws without an installation', () => {
        expect(() => resolveTarget(httpTrigger(), options({ target: TARGET }), 'r1')).toThrow(InvalidAgentDefinitionError);
        expect(() => resolveTarget(httpTrigger(), options({ target: TARGET }), 'r1')).toThrow('installationId');
    });
});
