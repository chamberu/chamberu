/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { readFileSync } from 'node:fs';
import {
    afterEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import { ControllableClock, createFakeGithub } from '@chamvi/test-kit';
import { createIssueApprovalEngine } from '../fixtures/readme-example.ts';
import { START, githubEvent } from '../utils/github.ts';
import { approvalModel } from '../utils/model.ts';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

afterEach(() => {
    vi.unstubAllEnvs();
});

function stubEnv() {
    const clock = new ControllableClock(START);
    const fake = createFakeGithub({ appId: '123', clock });
    fake.issues.set('octo/demo#7', { number: 7, state: 'open' });
    vi.stubEnv('GITHUB_APP_ID', '123');
    vi.stubEnv('GITHUB_PRIVATE_KEY', fake.privateKey.replaceAll('\n', '\\n'));
    vi.stubEnv('GITHUB_WEBHOOK_SECRET', 'readme-webhook-secret');
    vi.stubEnv('GITHUB_OWNER', 'octocat');
    vi.stubEnv('RESUME_SECRET', 'readme-resume-secret');
    return { clock, fake };
}

describe('README example', () => {
    it('is the code of test/fixtures/readme-example.ts', () => {
        const readme = read('../../README.md');
        const blocks = readme.matchAll(/```typescript\n([\s\S]*?)```/g).map((m) => m[1]).toArray();
        expect(blocks).toContain(read('../fixtures/readme-example.ts'));
    });

    it('asks on the issue once', async () => {
        const { clock, fake } = stubEnv();
        const { engine } = createIssueApprovalEngine(
            approvalModel('github_close_issue', { repo: 'octo/demo', number: 7 }),
            { fetch: fake.fetch, clock },
        );
        await engine.start();
        try {
            const { runId } = await engine.dispatch({
                agent: 'triage',
                trigger: 'github:issues.opened',
                source: 'github',
                payload: githubEvent(),
            });
            await engine.idle();
            expect((await engine.getRun(runId))?.status).toBe('waiting');
            const comments = fake.comments.get('octo/demo#7') ?? [];
            expect(comments).toHaveLength(1);
            expect(String(comments[0]!.body).startsWith('@octocat\n')).toBe(true);
        } finally {
            await engine.stop();
        }
    });

    it('needs the GitHub settings', () => {
        stubEnv();
        vi.stubEnv('GITHUB_OWNER', '');
        expect(() => createIssueApprovalEngine(approvalModel('github_close_issue'))).toThrow('GITHUB_OWNER');
    });
});
