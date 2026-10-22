/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import { loadAgent } from '@chamvi/app';
import { createTempDir, writeTree } from '../../utils/folder.ts';

describe('the default module reader', () => {
    let root: { path: string; remove: () => Promise<void> };

    beforeEach(async () => {
        root = await createTempDir();
    });

    afterEach(async () => {
        await root.remove();
    });

    it('re-reading a changed folder returns the new code, including an imported file', async () => {
        const dir = join(root.path, 'triage');
        await writeTree(dir, {
            'agent.ts': 'import { text } from \'./_text.ts\';\nexport default { model: \'test:model\', instructions: text };\n',
            '_text.ts': 'export const text: string = \'one\';\n',
        });

        expect((await loadAgent(dir)).agent.definition.instructions).toBe('one');

        await writeFile(join(dir, '_text.ts'), 'export const text: string = \'two\';\n');

        expect((await loadAgent(dir)).agent.definition.instructions).toBe('two');
    });

    it('a package from node_modules is the same instance as a native import', async () => {
        const pkg = join(root.path, 'node_modules', 'fake-registry');
        await writeTree(root.path, {
            'node_modules/fake-registry/package.json': JSON.stringify({
                name: 'fake-registry',
                type: 'module',
                exports: { '.': { import: './index.mjs', require: './index.cjs' } },
            }),
            'node_modules/fake-registry/index.mjs': 'export const registry = new WeakSet();\nexport function mark(value) { registry.add(value); return value; }\n',
            'node_modules/fake-registry/index.cjs': 'exports.registry = new WeakSet();\nexports.mark = (value) => { exports.registry.add(value); return value; };\n',
            'agents/triage/agent.ts': [
                'import { mark } from \'fake-registry\';',
                'export default { model: \'test:model\', instructions: \'x\', output: mark({ marked: true }) };',
                '',
            ].join('\n'),
        });

        const loaded = await loadAgent(join(root.path, 'agents', 'triage'));
        const native = await import(pathToFileURL(join(pkg, 'index.mjs')).href) as { registry: WeakSet<object> };

        expect(native.registry.has(loaded.agent.definition.output as object)).toBe(true);
    });

    it('a TypeScript enum loads', async () => {
        const dir = join(root.path, 'triage');
        await writeTree(dir, { 'agent.ts': 'enum Kind { Sort = \'sort the inbox\' }\nexport default { model: \'test:model\', instructions: Kind.Sort };\n' });

        expect((await loadAgent(dir)).agent.definition.instructions).toBe('sort the inbox');
    });
});
