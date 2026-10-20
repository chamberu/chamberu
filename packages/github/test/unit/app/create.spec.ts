/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createPrivateKey, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { InvalidAgentDefinitionError } from '@chamberu/core';
import { createGithubApp } from '@chamberu/github';
import type { GithubAppOptions } from '@chamberu/github';
import { ControllableClock } from '@chamberu/test-kit';
import { createFakeGithub } from '../../utils/github.ts';

const clock = new ControllableClock(new Date('2026-10-20T10:00:00Z'));
const fake = createFakeGithub({ appId: '123', clock });

function options(overrides: Partial<GithubAppOptions> = {}): GithubAppOptions {
    return {
        appId: 123,
        privateKey: fake.privateKey,
        webhookSecret: 'webhook-secret',
        clock,
        fetch: fake.fetch,
        ...overrides,
    };
}

describe('createGithubApp', () => {
    it('builds an app', () => {
        const gh = createGithubApp(options({ installationId: 42 }));
        expect(gh.appId).toBe('123');
        expect(gh.installationId).toBe(42);
    });

    it.each([
        ['an empty appId', { appId: '' }],
        ['an unparsable privateKey', { privateKey: 'not a key' }],
        ['an empty privateKey', { privateKey: '' }],
        ['an empty webhookSecret', { webhookSecret: '' }],
        ['an empty webhookSecret list', { webhookSecret: [] }],
        ['an empty secret in the list', { webhookSecret: ['a', ''] }],
        ['a zero installationId', { installationId: 0 }],
        ['a negative installationId', { installationId: -1 }],
        ['a fractional installationId', { installationId: 1.5 }],
        ['a non-RSA privateKey', { privateKey: generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() }],
    ])('refuses %s', (_name, overrides) => {
        expect(() => createGithubApp(options(overrides))).toThrow(InvalidAgentDefinitionError);
    });

    it('accepts a PEM with literal \\n sequences', async () => {
        const escaped = fake.privateKey.trim().replaceAll('\n', '\\n');
        expect(escaped).not.toContain('\n');
        const gh = createGithubApp(options({ privateKey: escaped }));
        const octokit = await gh.octokit(42);
        await octokit.request('GET /rate_limit');
        expect(fake.tokensIssued).toBeGreaterThan(0);
    });

    it('accepts a PKCS#8 key', async () => {
        const pkcs8 = createPrivateKey(fake.privateKey).export({ type: 'pkcs8', format: 'pem' }).toString();
        expect(pkcs8).toContain('BEGIN PRIVATE KEY');
        const issued = fake.tokensIssued;
        const gh = createGithubApp(options({ privateKey: pkcs8 }));
        await (await gh.octokit(43)).request('GET /rate_limit');
        expect(fake.tokensIssued).toBe(issued + 1);
    });
});
