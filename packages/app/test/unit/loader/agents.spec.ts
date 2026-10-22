/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { join } from 'node:path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import { listAgentFolders, loadAgents } from '@chamvi/app';
import { createTempDir, writeTree } from '../../utils/folder.ts';

const agent = (name: string) => `export default { name: '${name}', definition: { model: 'test:model', instructions: 'x' } };\n`;

describe('loadAgents', () => {
    let root: { path: string; remove: () => Promise<void> };

    beforeEach(async () => {
        root = await createTempDir();
    });

    afterEach(async () => {
        await root.remove();
    });

    it('loadAgents skips dot and underscore folders and reports broken folders as issues without absolute paths', async () => {
        await writeTree(root.path, {
            'beta/agent.mjs': agent('beta'),
            'alpha/agent.mjs': agent('alpha'),
            'broken/agent.mjs': 'export default {\n',
            'Bad_Name/agent.mjs': agent('Bad_Name'),
            'empty/notes.md': 'nothing here',
            '.tmp-upload/agent.mjs': agent('.tmp-upload'),
            '_shared/agent.mjs': agent('_shared'),
            'loose-file.mjs': agent('loose-file'),
        });

        const { agents, issues } = await loadAgents(root.path);

        expect(agents.map((a) => a.agent.name)).toEqual(['alpha', 'beta']);
        expect(agents.map((a) => a.dir)).toEqual([join(root.path, 'alpha'), join(root.path, 'beta')]);
        expect(issues.map((i) => i.agent)).toEqual(['Bad_Name', 'broken', 'empty']);
        for (const issue of issues) {
            expect(issue.message).not.toContain(root.path);
            expect(issue.message.length).toBeGreaterThan(0);
        }
        expect(issues[1]?.message).toMatch(/^broken\/agent\.mjs: /);
    });

    it('lists the agent folders by name', async () => {
        await writeTree(root.path, {
            'b/agent.mjs': agent('b'),
            'a/agent.mjs': agent('a'),
            '.git/HEAD': 'x',
            '_x/agent.mjs': agent('_x'),
            'file.txt': 'x',
        });

        expect(await listAgentFolders(root.path)).toEqual(['a', 'b']);
    });
});
