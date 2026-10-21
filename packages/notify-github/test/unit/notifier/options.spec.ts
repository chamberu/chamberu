/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import type { GithubNotifierOptions } from '@chamvi/notify-github';
import { resolveOptions } from '../../../src/notifier/helpers.ts';
import { createGithubFixture } from '../../utils/github.ts';

const { gh } = createGithubFixture();

describe('githubNotifier options', () => {
    it('defaults its name to github', () => {
        expect(resolveOptions({ app: gh }).name).toBe('github');
        expect(resolveOptions({ app: gh, name: 'issues' }).name).toBe('issues');
    });

    it('takes one mention or several', () => {
        expect(resolveOptions({ app: gh, mention: 'octocat' }).mentions).toEqual(['octocat']);
        expect(resolveOptions({ app: gh, mention: ['octocat', 'Mona-Lisa'] }).mentions).toEqual(['octocat', 'Mona-Lisa']);
        expect(resolveOptions({ app: gh }).mentions).toEqual([]);
    });

    it('keeps a valid target', () => {
        expect(resolveOptions({ app: gh, target: { repo: 'octo/demo', number: 7 } }).target).toEqual({
            owner: 'octo',
            repo: 'demo',
            number: 7,
        });
    });

    it.each<[string, Partial<GithubNotifierOptions>]>([
        ['no app', { app: undefined as unknown as GithubNotifierOptions['app'] }],
        ['an app without octokit', { app: {} as GithubNotifierOptions['app'] }],
        ['an empty name', { name: '' }],
        ['a mention starting with a dash', { mention: '-bad' }],
        ['a mention with a space', { mention: 'a b' }],
        ['a mention of 40 characters', { mention: 'a'.repeat(40) }],
        ['a mention with a double dash', { mention: ['ok', 'a--b'] }],
        ['a mention with an @', { mention: '@octocat' }],
        ['a target repo with ..', { target: { repo: '../x', number: 1 } }],
        ['a target repo without owner', { target: { repo: 'nope', number: 1 } }],
        ['a target number of 0', { target: { repo: 'octo/demo', number: 0 } }],
        ['a fractional target number', { target: { repo: 'octo/demo', number: 1.5 } }],
        ['a target installationId of 0', {
            target: {
                repo: 'octo/demo',
                number: 1,
                installationId: 0,
            },
        }],
        ['a zero timeoutMs', { timeoutMs: 0 }],
        ['a fractional timeoutMs', { timeoutMs: 2.5 }],
        ['a non-function approvalUrl', { approvalUrl: 'https://app.example/ui/approvals' as unknown as GithubNotifierOptions['approvalUrl'] }],
    ])('rejects %s', (_label, patch) => {
        expect(() => resolveOptions({ app: gh, ...patch })).toThrow(InvalidAgentDefinitionError);
    });
});
