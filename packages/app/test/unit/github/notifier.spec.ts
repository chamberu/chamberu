/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { defineAgent } from '@chamvi/core';
import { createGithubApp, githubWebhook } from '@chamvi/github';
import { ControllableClock, createFakeGithub } from '@chamvi/test-kit';
import { tool } from 'ai';
import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';
import { z } from 'zod';
import {
    AppToken,
    ModuleName,
    configModule,
    engineModule,
    storeModule,
} from '@chamvi/app';
import { githubNotifierModule } from '@chamvi/app/github';
import { createHarness } from '../../utils/harness.ts';
import type { Harness } from '../../utils/harness.ts';
import { SECRET } from '../../utils/app.ts';
import { createRecordingLogger } from '../../utils/logger.ts';
import { approvalModel } from '../../utils/model.ts';

let harnesses: Harness[] = [];

afterEach(async () => {
    await Promise.all(harnesses.map((h) => h.stop()));
    harnesses = [];
    globalThis.AI_SDK_DEFAULT_PROVIDER = undefined;
});

async function waitingComment(env: Record<string, string>) {
    const clock = new ControllableClock(new Date('2026-10-21T09:00:00Z'));
    const fake = createFakeGithub({
        appId: '1',
        slug: 'chamvi-test',
        clock,
    });
    fake.issues.set('octo/demo#7', {
        number: 7,
        title: 'Deploy please',
        state: 'open',
    });
    const app = createGithubApp({
        appId: '1',
        privateKey: fake.privateKey,
        webhookSecret: 's',
        slug: 'chamvi-test',
        clock,
        fetch: fake.fetch,
    });
    const agent = defineAgent({
        name: 'triage',
        model: approvalModel('deploy'),
        instructions: 'triage',
        triggers: [githubWebhook({ events: ['issues.opened'] })],
        tools: {
            deploy: tool({
                inputSchema: z.object({}),
                execute: async () => 'deployed',
            }),
        },
        approvals: { deploy: 'user' },
        notify: 'github',
    });
    const harness = await createHarness({
        env: { RESUME_SECRET: SECRET, ...env },
        agents: [agent],
        clock,
        modules: [
            configModule({ clock, logger: createRecordingLogger(clock) }),
            storeModule(),
            engineModule(),
            githubNotifierModule({ app }),
        ],
    });
    harnesses.push(harness);

    const engine = harness.container.resolve(AppToken.ENGINE);
    const { runId } = await engine.dispatch({
        agent: 'triage',
        trigger: 'github:issues.opened',
        source: 'github',
        payload: {
            name: 'issues',
            action: 'opened',
            delivery: 'd-1',
            installationId: 42,
            payload: {
                repository: { full_name: 'octo/demo' },
                issue: { number: 7 },
            },
        },
    });
    await engine.idle();
    expect((await engine.getRun(runId))?.status).toBe('waiting');

    const comments = fake.comments.get('octo/demo#7') ?? [];
    expect(comments).toHaveLength(1);
    return { runId, body: String(comments[0]!.body) };
}

describe('githubNotifierModule', () => {
    it('is named after the notifier and depends on config', () => {
        const app = { appId: '1' } as never;
        expect(githubNotifierModule({ app }).name).toBe('chamvi:notifier:github');
        expect(githubNotifierModule({ app, name: 'ops' }).name).toBe('chamvi:notifier:ops');
        expect(githubNotifierModule({ app }).dependencies).toEqual([ModuleName.CONFIG]);
    });

    it('uses CHAMVI_PUBLIC_URL for approval links', async () => {
        const { runId, body } = await waitingComment({ CHAMVI_PUBLIC_URL: 'https://chamvi.example' });
        expect(body).toContain(`https://chamvi.example/ui/approvals?run=${runId}&approval=`);
    });

    it('no link without CHAMVI_PUBLIC_URL', async () => {
        const { body } = await waitingComment({});
        expect(body).not.toContain('/ui/approvals?run=');
        expect(body).toContain('Answer it in the chamvi UI or through POST /runs/:id/approve.');
    });
});
