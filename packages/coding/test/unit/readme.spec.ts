/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import { createWorkspaceManager } from '@chamberu/sandbox';
import { createLocalSandbox } from '@chamberu/sandbox-local';
import { createCodingAgent } from '../fixtures/readme-example.ts';
import { mockModel } from '../utils/model.ts';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('README example', () => {
    let root: string;

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'chamberu-coding-readme-'));
    });

    afterEach(async () => {
        await rm(root, { recursive: true, force: true });
    });

    it('is the code of test/fixtures/readme-example.ts', () => {
        const readme = read('../../README.md');
        const blocks = readme.matchAll(/```typescript\n([\s\S]*?)```/g).map((m) => m[1]).toArray();
        expect(blocks).toContain(read('../fixtures/readme-example.ts'));
    });

    it('gives the agent the workspace and coding tools, bash behind an approval', async () => {
        const workspaces = createWorkspaceManager({ provider: createLocalSandbox({ root }), gcIntervalMs: 0 });
        const agent = createCodingAgent(mockModel([]), workspaces);

        expect(Object.keys(agent.definition.tools as object).sort()).toEqual([
            'bash',
            'create_workspace',
            'dispose_workspace',
            'edit_file',
            'git_diff',
            'grep',
            'list_files',
            'read_file',
            'write_file',
        ]);
        expect(agent.definition.approvals?.bash).toBe('user');
        await workspaces.close();
    });
});
