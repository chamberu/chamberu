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
import { ValidationError } from '@chamvi/core';
import type { GitFixture } from '@chamvi/test-kit';
import { createFixture, setupCoding } from '../../utils/setup.ts';
import type { CodingSetup } from '../../utils/setup.ts';

type Grep = {
    matches: Array<{
        path: string; 
        line: number; 
        text: string 
    }>;
    truncated: boolean 
};

let fixture: GitFixture;
let s: CodingSetup;

beforeAll(async () => { fixture = await createFixture(); });
afterAll(async () => { await fixture.cleanup(); });
beforeEach(async () => { s = await setupCoding(fixture); });
afterEach(async () => { await s.cleanup(); });

describe('grep', () => {
    it('finds a line', async () => {
        await expect(s.call('grep', { pattern: 'const b' })).resolves.toEqual({
            matches: [{
                path: 'src/a.ts', 
                line: 2, 
                text: 'export const b = 2;', 
            }],
            truncated: false,
        });
    });

    it('ignores case on request', async () => {
        await expect(s.call('grep', { pattern: 'CONST B' })).resolves.toEqual({ matches: [], truncated: false });
        const { matches } = await s.call<Grep>('grep', { pattern: 'CONST B', ignoreCase: true });
        expect(matches).toEqual([{
            path: 'src/a.ts', 
            line: 2, 
            text: 'export const b = 2;', 
        }]);
    });

    it('treats a leading dash as a pattern', async () => {
        await expect(s.call('grep', { pattern: '-x' })).resolves.toEqual({ matches: [], truncated: false });
    });

    it('refuses an invalid pattern', async () => {
        await expect(s.call('grep', { pattern: '(' })).rejects.toThrow(ValidationError);
        await expect(s.call('grep', { pattern: '' })).rejects.toThrow(ValidationError);
    });

    it('stops at the limit', async () => {
        await expect(s.call('grep', { pattern: 'export', limit: 1 })).resolves.toEqual({
            matches: [{
                path: 'src/a.ts', 
                line: 1, 
                text: 'export const a = 1;', 
            }],
            truncated: true,
        });
        await expect(s.call('grep', { pattern: 'export', limit: 0 })).rejects.toThrow(ValidationError);
        await expect(s.call('grep', { pattern: 'export', limit: 501 })).rejects.toThrow(ValidationError);
    });

    it('searches untracked files but not ignored ones', async () => {
        await s.workspace.writeFile('new.ts', 'export const c = 3;\n');
        await s.workspace.writeFile('dist/out.js', 'export const c = 3;\n');
        await expect(s.call('grep', { pattern: 'const c' })).resolves.toEqual({
            matches: [{
                path: 'new.ts', 
                line: 1, 
                text: 'export const c = 3;', 
            }],
            truncated: false,
        });
    });

    it('searches below a path and keeps odd file names', async () => {
        await s.workspace.writeFile('we:ird.ts', 'const a = 0;\n');
        await expect(s.call('grep', { pattern: 'const a', path: 'src' })).resolves.toEqual({
            matches: [{
                path: 'src/a.ts', 
                line: 1, 
                text: 'export const a = 1;', 
            }],
            truncated: false,
        });
        const { matches } = await s.call<Grep>('grep', { pattern: '^const a' });
        expect(matches).toEqual([{
            path: 'we:ird.ts', 
            line: 1, 
            text: 'const a = 0;', 
        }]);
    });

    it('cuts long lines at LINE_MAX_CHARS', async () => {
        await s.workspace.writeFile('long.txt', `needle${'y'.repeat(1_000)}\n`);
        const { matches } = await s.call<Grep>('grep', { pattern: 'needle' });
        expect(matches).toHaveLength(1);
        expect(matches[0]!.text).toHaveLength(500);
    });

    it('keeps a NUL past the binary check inside the match text', async () => {
        // git -I only inspects the first 8000 bytes; a later NUL must not shift the -z records
        await s.workspace.writeFile('late.txt', `${'x'.repeat(9_000)}\nneedle one\nneedle\0two\nneedle three\n`);
        const { matches } = await s.call<Grep>('grep', { pattern: 'needle', path: 'late.txt' });
        expect(matches).toEqual([
            {
                path: 'late.txt', 
                line: 2, 
                text: 'needle one', 
            },
            {
                path: 'late.txt', 
                line: 3, 
                text: 'needle\0two', 
            },
            {
                path: 'late.txt', 
                line: 4, 
                text: 'needle three', 
            },
        ]);
    });

    it('treats pathspec magic literally', async () => {
        await expect(s.call('grep', { pattern: 'const', path: ':!src' })).resolves.toEqual({ matches: [], truncated: false });
        await expect(s.call('list_files', { path: ':(top)src' })).resolves.toEqual({ files: [], truncated: false });
    });
});
