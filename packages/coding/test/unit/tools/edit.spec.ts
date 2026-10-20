/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import { ValidationError } from '@chamberu/core';
import type { GitFixture } from '@chamberu/test-kit';
import { createFixture, setupCoding } from '../../utils/setup.ts';
import type { CodingSetup } from '../../utils/setup.ts';

let fixture: GitFixture;
let s: CodingSetup;

beforeAll(async () => { fixture = await createFixture(); });
afterAll(async () => { await fixture.cleanup(); });
beforeEach(async () => { s = await setupCoding(fixture); });
afterEach(async () => { await s.cleanup(); });

describe('edit_file', () => {
    it('replaces one match', async () => {
        await expect(s.call('edit_file', {
            path: 'src/a.ts',
            oldString: 'a = 1',
            newString: 'a = 3',
        })).resolves.toEqual({ path: 'src/a.ts', replacements: 1 });
        await expect(s.workspace.readFile('src/a.ts')).resolves.toBe('export const a = 3;\nexport const b = 2;\n');
    });

    it('inserts replacement patterns literally', async () => {
        await s.call('edit_file', {
            path: 'src/a.ts',
            oldString: '1',
            newString: '$&$1$$',
        });
        await expect(s.workspace.readFile('src/a.ts')).resolves.toBe('export const a = $&$1$$;\nexport const b = 2;\n');
    });

    it('refuses a missing oldString', async () => {
        await expect(s.call('edit_file', {
            path: 'src/a.ts',
            oldString: 'nope',
            newString: 'x',
        })).rejects.toThrow(/not found/);
        await expect(s.call('edit_file', {
            path: 'src/a.ts',
            oldString: 'nope',
            newString: 'x',
        })).rejects.toThrow(ValidationError);
    });

    it('refuses several matches without replaceAll', async () => {
        const edit = s.call('edit_file', {
            path: 'src/a.ts',
            oldString: 'export',
            newString: 'export declare',
        });
        await expect(edit).rejects.toThrow(ValidationError);
        await expect(edit).rejects.toThrow(/2 matches/);
        await expect(s.workspace.readFile('src/a.ts')).resolves.toBe('export const a = 1;\nexport const b = 2;\n');
    });

    it('replaces every match with replaceAll', async () => {
        await expect(s.call('edit_file', {
            path: 'src/a.ts',
            oldString: 'export ',
            newString: '',
            replaceAll: true,
        })).resolves.toEqual({ path: 'src/a.ts', replacements: 2 });
        await expect(s.workspace.readFile('src/a.ts')).resolves.toBe('const a = 1;\nconst b = 2;\n');
    });

    it('refuses an empty or unchanged oldString', async () => {
        await expect(s.call('edit_file', {
            path: 'src/a.ts',
            oldString: '',
            newString: 'x',
        })).rejects.toThrow(ValidationError);
        await expect(s.call('edit_file', {
            path: 'src/a.ts',
            oldString: 'a = 1',
            newString: 'a = 1',
        })).rejects.toThrow(ValidationError);
        await expect(s.call('edit_file', {
            path: 'src/a.ts',
            oldString: 'a = 1',
            newString: 'a = 2',
            replaceAll: 'yes',
        })).rejects.toThrow(ValidationError);
    });
});
