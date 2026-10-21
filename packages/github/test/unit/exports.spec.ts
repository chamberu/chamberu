/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import * as github from '@chamvi/github';

describe('public api', () => {
    it.each([
        'createGithubApp',
        'githubWebhook',
    ])('exports %s', (name) => {
        expect(github).toHaveProperty(name);
        expect(github[name as keyof typeof github]).toBeTypeOf('function');
    });

    it('exports the defaults', () => {
        expect(github.DEFAULT_WEBHOOK_PATH).toBe('/webhooks/github');
        expect(github.DEFAULT_GITHUB_API_URL).toBe('https://api.github.com');
    });

    it('exports the request error code and the repository pattern', () => {
        expect(github.GITHUB_REQUEST_ERROR_CODE).toBe('github_request');
        const repo = new RegExp(github.REPO_PATTERN);
        expect(repo.test('octo/demo')).toBe(true);
        expect(repo.test('a/../b')).toBe(false);
        expect(repo.test('../x')).toBe(false);
    });

    it.each([
        'verifySignature',
        'createAppJwt',
        'createInstallationTokens',
        'createWebhookRoute',
        'createReadTools',
        'createWriteTools',
        'matchesGithubTrigger',
        'normalizePrivateKey',
        'stepOf',
    ])('keeps %s internal', (name) => {
        expect(github).not.toHaveProperty(name);
    });
});
