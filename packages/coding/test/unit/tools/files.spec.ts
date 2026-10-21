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
import { SandboxError, ValidationError } from '@chamberu/core';
import type { GitFixture } from '@chamberu/test-kit';
import { createFixture, setupCoding } from '../../utils/setup.ts';
import type { CodingSetup } from '../../utils/setup.ts';

let fixture: GitFixture;
let s: CodingSetup;

beforeAll(async () => { fixture = await createFixture(); });
afterAll(async () => { await fixture.cleanup(); });
beforeEach(async () => { s = await setupCoding(fixture); });
afterEach(async () => { await s.cleanup(); });

describe('read_file', () => {
    it('reads a whole file', async () => {
        await expect(s.call('read_file', { path: 'src/a.ts' })).resolves.toEqual({
            path: 'src/a.ts',
            content: 'export const a = 1;\nexport const b = 2;',
            startLine: 1,
            endLine: 2,
            totalLines: 2,
            truncated: false,
        });
    });

    it('reads a range', async () => {
        await expect(s.call('read_file', {
            path: '/workspace/src/a.ts',
            offset: 2,
            limit: 1,
        })).resolves.toEqual({
            path: 'src/a.ts',
            content: 'export const b = 2;',
            startLine: 2,
            endLine: 2,
            totalLines: 2,
            truncated: false,
        });
    });

    it('cuts at READ_MAX_CHARS', async () => {
        await s.workspace.writeFile('long.txt', `${'x'.repeat(70_000)}\nnext\n`);
        const result = await s.call<{
            content: string; 
            truncated: boolean; 
            endLine: number; 
            totalLines: number 
        }>('read_file', { path: 'long.txt' });
        expect(result.content).toHaveLength(65_536);
        expect(result.truncated).toBe(true);
        expect(result.endLine).toBe(1);
        expect(result.totalLines).toBe(2);
    });

    it('refuses an offset past the end and a limit out of range', async () => {
        await expect(s.call('read_file', { path: 'src/a.ts', offset: 3 })).rejects.toThrow(ValidationError);
        await expect(s.call('read_file', { path: 'src/a.ts', offset: 0 })).rejects.toThrow(ValidationError);
        await expect(s.call('read_file', { path: 'src/a.ts', limit: 2_001 })).rejects.toThrow(ValidationError);
        await expect(s.call('read_file', { path: 'src/a.ts', limit: 1.5 })).rejects.toThrow(ValidationError);
    });

    it('reads an empty file', async () => {
        await s.workspace.writeFile('empty.txt', '');
        await expect(s.call('read_file', { path: 'empty.txt' })).resolves.toMatchObject({
            content: '',
            totalLines: 0,
            truncated: false,
        });
    });
});

describe('write_file', () => {
    it('creates nested files', async () => {
        await expect(s.call('write_file', { path: 'x/y.txt', content: 'hi' })).resolves.toEqual({ path: 'x/y.txt', bytes: 2 });
        await expect(s.workspace.readFile('x/y.txt')).resolves.toBe('hi');
    });

    it('counts bytes, not characters', async () => {
        await expect(s.call('write_file', { path: 'u.txt', content: '€' })).resolves.toEqual({ path: 'u.txt', bytes: 3 });
    });

    it('refuses a non-string content', async () => {
        await expect(s.call('write_file', { path: 'u.txt', content: 42 })).rejects.toThrow(ValidationError);
    });
});

describe('list_files', () => {
    it('lists tracked and untracked but not ignored', async () => {
        await s.call('write_file', { path: 'new.ts', content: 'export {};\n' });
        await s.call('write_file', { path: 'dist/out.js', content: '1;\n' });
        const { files, truncated } = await s.call<{ files: string[]; truncated: boolean }>('list_files', {});
        expect(files).toContain('src/a.ts');
        expect(files).toContain('new.ts');
        expect(files).not.toContain('dist/out.js');
        expect(truncated).toBe(false);
    });

    it('lists below a path and up to a limit', async () => {
        await expect(s.call('list_files', { path: 'src' })).resolves.toEqual({ files: ['src/a.ts'], truncated: false });
        const { files, truncated } = await s.call<{ files: string[]; truncated: boolean }>('list_files', { limit: 1 });
        expect(files).toHaveLength(1);
        expect(truncated).toBe(true);
    });
});

describe('workspace resolution', () => {
    it('resolves the only workspace without an id', async () => {
        await expect(s.call('read_file', { path: 'src/a.ts', workspace: s.workspace.id })).resolves.toMatchObject({ totalLines: 2 });
        await expect(s.call('read_file', { path: 'src/a.ts' })).resolves.toMatchObject({ totalLines: 2 });
    });

    it('refuses another run\'s workspace', async () => {
        await expect(s.call('read_file', { path: 'src/a.ts', workspace: s.workspace.id }, 'r2')).rejects.toThrow(SandboxError);
        await expect(s.call('write_file', {
            path: 'x', 
            content: 'y', 
            workspace: s.workspace.id, 
        }, 'r2')).rejects.toThrow(SandboxError);
    });

    it('refuses escapes', async () => {
        await expect(s.call('read_file', { path: '../x' })).rejects.toThrow(ValidationError);
        await expect(s.call('write_file', { path: '/etc/x', content: 'y' })).rejects.toThrow(ValidationError);
        await expect(s.call('list_files', { path: '../' })).rejects.toThrow(ValidationError);
    });

    it('refuses a non-object input and a missing path', async () => {
        await expect(s.call('read_file', 'src/a.ts')).rejects.toThrow(ValidationError);
        await expect(s.call('read_file', {})).rejects.toThrow(ValidationError);
        await expect(s.call('read_file', { path: 'src/a.ts', workspace: 7 })).rejects.toThrow(ValidationError);
    });
});
