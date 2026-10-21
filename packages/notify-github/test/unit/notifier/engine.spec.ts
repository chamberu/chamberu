/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';
import {
    Engine,
    MemoryStore,
    createResumeToken,
    defineAgent,
} from '@chamvi/core';
import type { ChamviError } from '@chamvi/core';
import { githubWebhook } from '@chamvi/github';
import { githubNotifier } from '@chamvi/notify-github';
import type { GithubNotifierOptions } from '@chamvi/notify-github';
import { createGithubFixture, githubEvent } from '../../utils/github.ts';
import { approvalModel } from '../../utils/model.ts';

const engines: Engine[] = [];

afterEach(async () => {
    await Promise.all(engines.map((engine) => engine.stop()));
    engines.length = 0;
});

function setup(patch: Partial<GithubNotifierOptions> = {}) {
    const {
        clock, 
        fake, 
        gh, 
    } = createGithubFixture();
    const agent = defineAgent({
        name: 'triage',
        model: approvalModel('github_close_issue', { repo: 'octo/demo', number: 7 }),
        instructions: 'Close duplicates.',
        triggers: [githubWebhook({ events: ['issues.opened'] })],
        tools: () => gh.writeTools(),
        approvals: { github_close_issue: 'user' },
        notify: 'github',
    });
    const errors: unknown[] = [];
    const engine = new Engine({
        store: new MemoryStore({ clock }),
        agents: [agent],
        notifiers: {
            github: githubNotifier({
                app: gh, 
                mention: 'owner', 
                clock, 
                ...patch,
            }), 
        },
        resumeSecret: 'resume-secret',
        clock,
        claimTtlMs: 30,
        onError: (error) => {
            errors.push(error);
        },
    });
    engines.push(engine);
    const comments = () => fake.comments.get('octo/demo#7') ?? [];
    return {
        fake,
        engine,
        errors,
        comments,
    };
}

type Ctx = ReturnType<typeof setup>;

async function dispatchToWaiting(ctx: Ctx) {
    await ctx.engine.start();
    const { runId } = await ctx.engine.dispatch({
        agent: 'triage',
        trigger: 'github:issues.opened',
        source: 'github',
        payload: githubEvent(),
    });
    await ctx.engine.idle();
    expect((await ctx.engine.getRun(runId))?.status).toBe('waiting');
    return runId;
}

describe('githubNotifier with the engine', () => {
    it('comments once per approval', async () => {
        const ctx = setup();
        const runId = await dispatchToWaiting(ctx);
        expect(ctx.comments()).toHaveLength(1);
        expect(String(ctx.comments()[0]!.body)).toContain('### Approval required: github_close_issue');
        expect((await ctx.engine.getRun(runId))?.waiting?.notifiedAt).toBeInstanceOf(Date);

        await ctx.engine.tick();
        await ctx.engine.tick();
        expect(ctx.comments()).toHaveLength(1);
        expect(ctx.errors).toEqual([]);
    });

    it('links to the approval without the token', async () => {
        const ctx = setup({ approvalUrl: (ref) => `https://chamvi.example/ui/approvals?run=${ref.runId}&approval=${ref.approvalId}&agent=${ref.agent}` });
        const runId = await dispatchToWaiting(ctx);
        const waiting = (await ctx.engine.getRun(runId))!.waiting!;
        const body = String(ctx.comments()[0]!.body);
        expect(body).toContain(`Approve or deny: https://chamvi.example/ui/approvals?run=${runId}&approval=${waiting.approvalId}&agent=triage`);
        const token = createResumeToken('resume-secret', {
            runId,
            approvalId: waiting.approvalId,
            tokenId: waiting.tokenId,
            expiresAt: waiting.expiresAt,
        });
        const posted = JSON.stringify(ctx.fake.requests.filter((r) => r.method === 'POST' && r.path.endsWith('/comments')));
        expect(posted).not.toContain(token);
        expect(posted).not.toContain(token.split('.')[1]);
    });

    it('reconciles a lost response', async () => {
        const ctx = setup();
        let lost = false;
        ctx.fake.route('POST', '/repos/:owner/:repo/issues/:number/comments', ({ params, body }) => {
            const key = `${params.owner}/${params.repo}#${params.number}`;
            ctx.fake.comments.set(key, [...(ctx.fake.comments.get(key) ?? []), {
                id: 1,
                body: (body as { body: string }).body,
                user: { login: 'chamvi-test[bot]', type: 'Bot' },
                created_at: '2026-10-21T09:00:00.000Z',
                updated_at: '2026-10-21T09:00:00.000Z',
            }]);
            if (lost) return { status: 201, body: { id: 1 } };
            lost = true;
            return { status: 502, body: { message: 'Bad Gateway' } };
        });
        const runId = await dispatchToWaiting(ctx);
        expect(ctx.errors).toHaveLength(1);
        expect((ctx.errors[0] as ChamviError).code).toBe('github_request');
        expect(ctx.comments()).toHaveLength(1);
        expect((await ctx.engine.getRun(runId))?.waiting?.notifiedAt).toBeUndefined();

        await ctx.engine.tick();
        expect(ctx.comments()).toHaveLength(1);
        expect((await ctx.engine.getRun(runId))?.waiting?.notifiedAt).toBeInstanceOf(Date);
    });
});
