/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import { ChamviError, InvalidAgentDefinitionError } from '@chamvi/core';
import type { Notification } from '@chamvi/core';
import type { GithubAppOptions } from '@chamvi/github';
import { GITHUB_NOTIFIER_TIMEOUT_MS, githubNotifier } from '@chamvi/notify-github';
import type { GithubNotifierOptions } from '@chamvi/notify-github';
import { renderComment } from '../../../src/notifier/helpers.ts';
import {
    createGithubFixture,
    githubEvent,
    githubTrigger,
    httpTrigger,
} from '../../utils/github.ts';

const approval: Notification = {
    kind: 'approval',
    agent: 'release',
    runId: 'r1',
    title: 'Approval required: github_close_issue',
    body: 'Agent "release" wants to call "github_close_issue" with:\n{"repo":"octo/demo","number":7}',
    resumeToken: 'secret-token',
    expiresAt: new Date('2026-10-22T09:00:00Z'),
};

const COMMENTS = '/repos/octo/demo/issues/7/comments';

function setup(patch: Partial<GithubNotifierOptions> = {}, app: Partial<GithubAppOptions> = {}) {
    const fixture = createGithubFixture(app);
    const notifier = githubNotifier({
        app: fixture.gh,
        mention: 'owner',
        clock: fixture.clock,
        ...patch,
    });
    const posts = () => fixture.fake.requests.filter((r) => r.method === 'POST' && r.path.endsWith('/comments'));
    return {
        ...fixture, 
        notifier, 
        posts, 
    };
}

async function rejection(promise: Promise<unknown>): Promise<ChamviError> {
    const error = await promise.then(() => undefined, (e: unknown) => e);
    expect(error).toBeInstanceOf(ChamviError);
    return error as ChamviError;
}

describe('githubNotifier notify', () => {
    it('posts one comment', async () => {
        const {
            notifier, 
            posts, 
            fake, 
        } = setup();
        await notifier.notify(approval, { idempotencyKey: 'r1:a1', trigger: githubTrigger() });
        expect(posts()).toHaveLength(1);
        expect(posts()[0]!.path).toBe(COMMENTS);
        expect(posts()[0]!.body).toEqual({
            body: renderComment(approval, {
                mentions: ['owner'],
                marker: '<!-- chamvi:effect=r1:a1 -->',
            }),
        });
        // as installation 42, the event's
        expect(fake.tokenInstallations).toEqual([42]);
    });

    it('finds its own comment', async () => {
        const { notifier, posts } = setup();
        const opts = { idempotencyKey: 'r1:a1', trigger: githubTrigger() };
        await notifier.notify(approval, opts);
        await notifier.notify(approval, opts);
        expect(posts()).toHaveLength(1);
    });

    it('ignores a copied marker', async () => {
        const {
            notifier, 
            posts, 
            fake, 
            clock, 
        } = setup();
        const marker = '<!-- chamvi:effect=r1:a1 -->';
        fake.comments.set('octo/demo#7', [{
            id: 1,
            body: `copied ${marker}`,
            user: { login: 'mallory', type: 'User' },
            updated_at: clock.now().toISOString(),
        }]);
        await notifier.notify(approval, { idempotencyKey: 'r1:a1', trigger: githubTrigger() });
        expect(posts()).toHaveLength(1);

        const other = setup();
        other.fake.comments.set('octo/demo#7', [{
            id: 2,
            body: `posted earlier ${marker}`,
            user: { login: 'Chamvi-Test[bot]', type: 'Bot' },
            updated_at: other.clock.now().toISOString(),
        }]);
        await other.notifier.notify(approval, { idempotencyKey: 'r1:a1', trigger: githubTrigger() });
        expect(other.posts()).toHaveLength(0);
    });

    it('posts again for another key', async () => {
        const { notifier, posts } = setup();
        await notifier.notify(approval, { idempotencyKey: 'r1:a1', trigger: githubTrigger() });
        await notifier.notify(approval, { idempotencyKey: 'r1:a2', trigger: githubTrigger() });
        expect(posts()).toHaveLength(2);
    });

    it('lists comments since the run was received, less the skew', async () => {
        const { notifier, fake } = setup();
        await notifier.notify(approval, { idempotencyKey: 'r1:a1', trigger: githubTrigger() });
        const list = fake.requests.find((r) => r.method === 'GET' && r.path === COMMENTS);
        expect(list?.query).toMatchObject({ since: '2026-10-21T08:00:00.000Z', per_page: '100' });
    });

    it('throws on a GitHub failure', async () => {
        const {
            notifier, 
            posts, 
            fake, 
        } = setup();
        fake.failNext('POST', COMMENTS, 502);
        const opts = { idempotencyKey: 'r1:a1', trigger: githubTrigger() };
        const error = await rejection(notifier.notify(approval, opts));
        expect(error.code).toBe('github_request');
        expect(error.message.startsWith('GitHub 502')).toBe(true);
        expect(error.message).not.toContain('ghs_');

        await notifier.notify(approval, opts);
        expect(posts()).toHaveLength(2);
        expect(fake.comments.get('octo/demo#7')).toHaveLength(1);
    });

    it('throws a configuration error before any request', async () => {
        const { notifier, fake } = setup({}, { installationId: 42 });
        await expect(notifier.notify(approval, { idempotencyKey: 'r1:a1', trigger: httpTrigger() }))
            .rejects.toBeInstanceOf(InvalidAgentDefinitionError);
        expect(fake.requests).toEqual([]);
    });

    it('times out', async () => {
        const {
            notifier, 
            fake, 
            clock, 
        } = setup();
        fake.route('GET', '/repos/:owner/:repo/issues/:number/comments', () => new Promise(() => {}));
        const pending = notifier.notify(approval, { idempotencyKey: 'r1:a1', trigger: githubTrigger() });
        await vi.waitFor(() => expect(fake.requests.some((r) => r.path.endsWith('/comments'))).toBe(true));
        clock.advance(GITHUB_NOTIFIER_TIMEOUT_MS);
        const error = await rejection(pending);
        expect(error.code).toBe('github_request');
        expect(error.message).toBe('GitHub did not answer within 30000ms.');
    });

    it('comments on the fallback target of an http run', async () => {
        const { notifier, posts } = setup({ target: { repo: 'octo/demo', number: 7 } }, { installationId: 42 });
        await notifier.notify(approval, { idempotencyKey: 'r1:a1', trigger: httpTrigger() });
        expect(posts().map((r) => r.path)).toEqual([COMMENTS]);
    });

    it('comments on the fallback target of a push run as its installation', async () => {
        const {
            notifier, 
            posts, 
            fake, 
        } = setup({ target: { repo: 'octo/demo', number: 7 } });
        const event = githubEvent({
            name: 'push',
            action: undefined,
            payload: { repository: { full_name: 'octo/demo' } },
        });
        await notifier.notify(approval, { idempotencyKey: 'r1:a1', trigger: githubTrigger(event) });
        expect(posts().map((r) => r.path)).toEqual([COMMENTS]);
        expect(fake.tokenInstallations).toEqual([42]);
    });
});
