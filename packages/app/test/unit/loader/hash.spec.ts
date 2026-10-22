/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createHash } from 'node:crypto';
import { rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import { hashAgentFolder } from '@chamvi/app';
import { createTempDir, writeTree } from '../../utils/folder.ts';

describe('hashAgentFolder', () => {
    let root: { path: string; remove: () => Promise<void> };

    beforeEach(async () => {
        root = await createTempDir();
    });

    afterEach(async () => {
        await root.remove();
    });

    it('hashAgentFolder is stable across file order and changes with any byte or rename', async () => {
        const one = join(root.path, 'one');
        const two = join(root.path, 'two');
        await writeTree(one, {
            'agent.mjs': 'a', 
            'tools/x.mjs': 'x', 
            'instructions.md': 'i', 
        });
        await writeTree(two, {
            'tools/x.mjs': 'x', 
            'instructions.md': 'i', 
            'agent.mjs': 'a', 
        });

        const hash = await hashAgentFolder(one);
        expect(hash).toMatch(/^[0-9a-f]{64}$/);
        expect(await hashAgentFolder(two)).toBe(hash);

        await writeFile(join(two, 'tools/x.mjs'), 'y');
        expect(await hashAgentFolder(two)).not.toBe(hash);
        await writeFile(join(two, 'tools/x.mjs'), 'x');
        expect(await hashAgentFolder(two)).toBe(hash);

        await rename(join(two, 'tools/x.mjs'), join(two, 'tools/z.mjs'));
        expect(await hashAgentFolder(two)).not.toBe(hash);
    });

    it('skips dot entries and hashes path and bytes in POSIX path order', async () => {
        const dir = join(root.path, 'agent');
        await writeTree(dir, {
            'b.md': 'B',
            'a/c.md': 'C',
            '.git/HEAD': 'ignored',
            'tools/.cache': 'ignored',
        });

        const expected = createHash('sha256')
            .update('a/c.md\0C\0')
            .update('b.md\0B\0')
            .digest('hex');

        expect(await hashAgentFolder(dir)).toBe(expected);
    });
});
