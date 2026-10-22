/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { InvalidAgentDefinitionError, defineAgent } from '@chamvi/core';
import { githubWebhook } from '@chamvi/github';
import { ControllableClock, createFakeGithub } from '@chamvi/test-kit';
import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';
import {
    AppToken,
    configModule,
    engineModule,
    httpModule,
    staticTokensModule,
    storeModule,
} from '@chamvi/app';
import { githubModule } from '@chamvi/app/github';
import { createHarness } from '../../utils/harness.ts';
import type { Harness } from '../../utils/harness.ts';
import { SECRET, TOKENS } from '../../utils/app.ts';
import { createRecordingLogger } from '../../utils/logger.ts';
import { textModel } from '../../utils/model.ts';
import { freePort } from '../../utils/port.ts';

const clock = new ControllableClock(new Date('2026-10-20T10:00:00Z'));
const fake = createFakeGithub({ appId: '1', clock });

function githubEnv(patch: Record<string, string | undefined> = {}): Record<string, string | undefined> {
    return {
        GITHUB_APP_ID: '1',
        GITHUB_APP_PRIVATE_KEY: fake.privateKey,
        GITHUB_WEBHOOK_SECRET: 'a',
        ...patch,
    };
}

function sign(body: string, secret: string): string {
    return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

let harnesses: Harness[] = [];

afterEach(async () => {
    await Promise.all(harnesses.map((h) => h.stop()));
    harnesses = [];
    globalThis.AI_SDK_DEFAULT_PROVIDER = undefined;
});

describe('githubModule', () => {
    it('reads env when called', async () => {
        const module = githubModule({ env: githubEnv({ GITHUB_APP_SLUG: 'my-app', GITHUB_INSTALLATION_ID: '7' }) });
        expect(module.name).toBe('chamvi:github');
        expect(module.app.appId).toBe('1');
        expect(module.app.installationId).toBe(7);
        expect(await module.app.botLogin()).toBe('my-app[bot]');
    });

    it('a missing variable names it', () => {
        expect(() => githubModule({ env: githubEnv({ GITHUB_WEBHOOK_SECRET: '' }) }))
            .toThrow(new InvalidAgentDefinitionError('GITHUB_WEBHOOK_SECRET is required.'));
        expect(() => githubModule({ env: githubEnv({ GITHUB_APP_ID: undefined }) }))
            .toThrow('GITHUB_APP_ID is required.');
    });

    it.each([
        ['GITHUB_API_URL', 'https://ghe.example.com/api/v3?access_token=s3cr3t', 's3cr3t'],
        ['GITHUB_APP_SLUG', 'Secret-Slug', 'Secret-Slug'],
    ])('a malformed %s names it and never echoes the value', (name, value, secret) => {
        let error: unknown;
        try {
            githubModule({ env: githubEnv({ [name]: value }) });
        } catch (e) {
            error = e;
        }
        expect(error).toBeInstanceOf(InvalidAgentDefinitionError);
        expect((error as Error).message).toMatch(new RegExp(`^${name} must `));
        expect((error as Error).message).not.toContain(secret);
        expect((error as Error).message).toMatch(/\.$/);
    });

    it('a private key error never echoes the key', () => {
        const key = 'not-a-key-but-a-secret-value';
        let error: unknown;
        try {
            githubModule({ env: githubEnv({ GITHUB_APP_PRIVATE_KEY: key }) });
        } catch (e) {
            error = e;
        }
        expect(error).toBeInstanceOf(InvalidAgentDefinitionError);
        expect((error as Error).message).toContain('GITHUB_APP_PRIVATE_KEY');
        expect((error as Error).message).not.toContain(key);
    });

    it('a malformed GITHUB_INSTALLATION_ID names it', () => {
        expect(() => githubModule({ env: githubEnv({ GITHUB_INSTALLATION_ID: '0' }) }))
            .toThrow('GITHUB_INSTALLATION_ID must be at least 1.');
    });

    it('comma-separated secrets', () => {
        const { app } = githubModule({ env: githubEnv({ GITHUB_WEBHOOK_SECRET: 'a,b' }) });
        const body = '{"zen":"hi"}';
        const bytes = new TextEncoder().encode(body);
        expect(app.verifySignature(bytes, sign(body, 'b'))).toBe(true);
        expect(app.verifySignature(bytes, sign(body, 'a'))).toBe(true);
        expect(app.verifySignature(bytes, sign(body, 'c'))).toBe(false);
    });

    it('literal \\n in the key works', () => {
        const escaped = fake.privateKey.trim().replace(/\n/g, '\\n');
        expect(escaped).not.toContain('\n');
        expect(() => githubModule({ env: githubEnv({ GITHUB_APP_PRIVATE_KEY: escaped }) })).not.toThrow();
    });

    it('explicit options win and need no env', () => {
        const module = githubModule({
            env: {},
            appId: '9',
            privateKey: fake.privateKey,
            webhookSecret: 's',
        });
        expect(module.app.appId).toBe('9');
    });

    it('a given app is used as is', () => {
        const { app } = githubModule({ env: githubEnv() });
        expect(githubModule({ app, env: {} }).app).toBe(app);
    });

    it('contributes the webhook route', async () => {
        const harness = await createHarness({ modules: [githubModule({ env: githubEnv() })] });
        harnesses.push(harness);
        const routes = harness.container.resolveAll(AppToken.HTTP_ROUTES);
        expect(routes.map((route) => [route.method, route.path])).toEqual([['POST', '/webhooks/github']]);
    });

    it('contributes the webhook route at webhookPath', async () => {
        const harness = await createHarness({ modules: [githubModule({ env: githubEnv(), webhookPath: '/gh' })] });
        harnesses.push(harness);
        const routes = harness.container.resolveAll(AppToken.HTTP_ROUTES);
        expect(routes.map((route) => route.path)).toEqual(['/gh']);
    });

    it('end to end', async () => {
        const port = await freePort();
        const agent = defineAgent({
            name: 'triage',
            model: textModel(),
            instructions: 'triage',
            triggers: [githubWebhook({ events: ['issues.opened'] })],
        });
        const harness = await createHarness({
            env: {
                RESUME_SECRET: SECRET,
                CHAMVI_TOKENS: TOKENS,
                HOST: '127.0.0.1',
                PORT: String(port),
            },
            agents: [agent],
            modules: [
                configModule({ logger: createRecordingLogger() }),
                storeModule(),
                staticTokensModule(),
                engineModule(),
                httpModule({ metrics: false, rateLimit: false }),
                githubModule({ env: githubEnv({ GITHUB_APP_SLUG: 'chamvi-test' }) }),
            ],
        });
        harnesses.push(harness);

        const body = readFileSync(new URL('../../../../github/test/fixtures/deliveries/issues-opened.json', import.meta.url), 'utf8');
        const response = await fetch(`http://127.0.0.1:${port}/webhooks/github`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-github-event': 'issues',
                'x-github-delivery': 'd-1',
                'x-hub-signature-256': sign(body, 'a'),
            },
            body,
        });
        expect(response.status).toBe(202);
        const answer = await response.json() as { runs: Array<{ agent: string; runId: string }> };
        expect(answer.runs).toHaveLength(1);
        expect(answer.runs[0]!.agent).toBe('triage');
    });
});
