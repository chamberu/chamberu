/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defineAgent } from '@chamberu/core';
import type { IGithubApp } from '@chamberu/github';
import { githubWebhook } from '@chamberu/github';
import { createGithubTestApp, deliver } from '../../utils/app.ts';
import { mockModel } from '../../utils/model.ts';
import type { MockResponse } from '../../utils/model.ts';

const ISSUES_OPENED = readFileSync(new URL('../../fixtures/deliveries/issues-opened.json', import.meta.url), 'utf8');

function triage(script: MockResponse[]) {
    return (gh: IGithubApp) => [defineAgent({
        name: 'triage',
        model: mockModel(script),
        instructions: 'Triage new issues.',
        triggers: [githubWebhook({ events: ['issues.opened'] })],
        tools: () => ({ ...gh.readTools(), ...gh.writeTools() }),
        approvals: { github_close_issue: 'user' },
    })];
}

function setup(script: MockResponse[]) {
    const setup = createGithubTestApp({ agents: triage(script) });
    const { issue } = (JSON.parse(ISSUES_OPENED) as { issue: Record<string, unknown> });
    setup.fake.issues.set('octo/demo#5', { ...issue });
    return setup;
}

const ISSUE = { repo: 'octo/demo', number: 5 };

describe('webhook to comment', () => {
    it('labels and comments once, also after a redelivery', async () => {
        const {
            app,
            engine,
            store,
            fake,
        } = setup([
            {
                parts: [{
                    type: 'tool-call', 
                    toolName: 'github_get_issue', 
                    input: ISSUE, 
                }], 
            },
            {
                parts: [
                    {
                        type: 'tool-call', 
                        toolName: 'github_add_labels', 
                        input: { ...ISSUE, labels: ['bug'] }, 
                    },
                    {
                        type: 'tool-call', 
                        toolName: 'github_create_comment', 
                        input: { ...ISSUE, body: 'Thanks, labelled as a bug.' }, 
                    },
                ],
            },
            { parts: [{ type: 'text', text: 'Triaged.' }] },
        ]);

        const response = await deliver(app, {
            event: 'issues',
            delivery: 'd-1',
            body: ISSUES_OPENED,
        });
        expect(response.status).toBe(202);
        const { runs } = await response.json() as { runs: Array<{ runId: string }> };
        await engine.start();
        await engine.idle();

        const run = await store.getRun(runs[0]!.runId);
        expect(run?.status).toBe('completed');
        expect(run?.output).toBe('Triaged.');
        const comments = fake.comments.get('octo/demo#5') ?? [];
        expect(comments).toHaveLength(1);
        expect(comments[0]?.body).toContain(`<!-- chamberu:effect=${run!.id}:github_create_comment:octo/demo#5:1 -->`);
        expect(fake.issues.get('octo/demo#5')?.labels).toEqual([{ name: 'bug' }]);

        const redelivered = await deliver(app, {
            event: 'issues',
            delivery: 'd-1',
            body: ISSUES_OPENED,
        });
        expect(await redelivered.json()).toMatchObject({ runs: [{ deduplicated: true }] });
        await engine.idle();
        expect(fake.comments.get('octo/demo#5')).toHaveLength(1);
        await engine.drain();
    });

    it('pauses before closing an issue', async () => {
        const {
            app,
            engine,
            store,
            fake,
        } = setup([
            {
                parts: [{
                    type: 'tool-call', 
                    toolName: 'github_close_issue', 
                    input: { ...ISSUE, reason: 'not_planned' }, 
                }], 
            },
            { parts: [{ type: 'text', text: 'Closed.' }] },
        ]);
        const response = await deliver(app, {
            event: 'issues',
            delivery: 'd-1',
            body: ISSUES_OPENED,
        });
        const { runs } = await response.json() as { runs: Array<{ runId: string }> };
        await engine.start();
        await engine.idle();

        const run = await store.getRun(runs[0]!.runId);
        expect(run?.status).toBe('waiting');
        expect(run?.waiting?.toolName).toBe('github_close_issue');
        expect(fake.requests.filter((r) => r.method === 'PATCH')).toHaveLength(0);
        await engine.drain();
    });
});
