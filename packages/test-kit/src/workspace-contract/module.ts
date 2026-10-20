/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Buffer } from 'node:buffer';
import {
    afterAll,
    beforeAll,
    describe,
    expect,
    it,
} from 'vitest';
import { SandboxError, ValidationError } from '@chamberu/core';
import type { IWorkspace } from '@chamberu/sandbox';
import type { WorkspaceContractFactory } from './types.ts';

const TEST_TIMEOUT_MS = 30_000;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// The suite runs real processes, so it waits on real time (documented exception to IClock).
const sleep = (ms: number) => new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
});

/**
 * Shared behavioural contract for every `IWorkspace` a sandbox provider
 * creates: argv exec, exit codes, stdin, cwd and path escapes, output caps,
 * process-group kills on timeout, abort, UTF-8 files, size caps and
 * dispose. It runs real processes with short real timeouts.
 *
 * @param name     Suite name, e.g. the provider name.
 * @param factory  A fresh, repo-less workspace per call; the suite disposes it.
 */
export function describeWorkspaceContract(name: string, factory: WorkspaceContractFactory): void {
    describe(`workspace contract: ${name}`, () => {
        let workspace: IWorkspace;

        beforeAll(async () => {
            workspace = await factory();
        }, TEST_TIMEOUT_MS);

        afterAll(async () => {
            await workspace?.dispose();
        }, TEST_TIMEOUT_MS);

        it('runs argv and reports the exit code', async () => {
            const result = await workspace.exec(['echo', 'hello']);
            expect(result).toMatchObject({
                exitCode: 0,
                stdout: 'hello\n',
                stderr: '',
                stdoutTruncated: false,
                stderrTruncated: false,
                timedOut: false,
            });
            expect(result.durationMs).toBeGreaterThanOrEqual(0);
        }, TEST_TIMEOUT_MS);

        it('separates stdout and stderr', async () => {
            const result = await workspace.exec(['sh', '-c', 'echo out; echo err >&2; exit 3']);
            expect(result.exitCode).toBe(3);
            expect(result.stdout).toBe('out\n');
            expect(result.stderr).toBe('err\n');
        }, TEST_TIMEOUT_MS);

        it('reports a missing command as 127', async () => {
            const result = await workspace.exec(['chamberu-no-such-command']);
            expect(result.exitCode).toBe(127);
        }, TEST_TIMEOUT_MS);

        it('passes stdin', async () => {
            const result = await workspace.exec(['cat'], { stdin: 'piped ✓' });
            expect(result.stdout).toBe('piped ✓');
        }, TEST_TIMEOUT_MS);

        it('has a uuid id', () => {
            expect(workspace.id).toMatch(UUID_PATTERN);
        });

        it('runs in a relative cwd and refuses escapes', async () => {
            await workspace.writeFile('sub/dir/f.txt', 'x');
            const result = await workspace.exec(['pwd'], { cwd: 'sub/dir' });
            expect(result.stdout.endsWith('/sub/dir\n')).toBe(true);

            for (const cwd of ['../..', '/etc', '', 'a\0b']) {
                await expect(workspace.exec(['pwd'], { cwd })).rejects.toBeInstanceOf(ValidationError);
            }
        }, TEST_TIMEOUT_MS);

        it('caps output per stream', async () => {
            const result = await workspace.exec(['sh', '-c', 'head -c 1000000 /dev/zero | tr "\\0" a']);
            expect(result.exitCode).toBe(0);
            expect(Buffer.byteLength(result.stdout)).toBe(65_536);
            expect(result.stdoutTruncated).toBe(true);
            expect(result.timedOut).toBe(false);
        }, TEST_TIMEOUT_MS);

        it('kills the whole process group on timeout', async () => {
            const result = await workspace.exec(
                ['sh', '-c', '(sleep 2; touch late.txt) & sleep 30'],
                { timeoutMs: 500 },
            );
            expect(result.timedOut).toBe(true);
            expect(result.durationMs).toBeLessThan(10_000);

            await sleep(3_000);
            const listing = await workspace.exec(['ls', '-a']);
            expect(listing.stdout).not.toContain('late.txt');
        }, TEST_TIMEOUT_MS);

        it('rejects an aborted exec', async () => {
            const controller = new AbortController();
            setTimeout(() => controller.abort(), 200);
            const started = Date.now();
            await expect(workspace.exec(['sleep', '30'], { signal: controller.signal }))
                .rejects.toBeInstanceOf(SandboxError);
            expect(Date.now() - started).toBeLessThan(10_000);
        }, TEST_TIMEOUT_MS);

        it('round-trips UTF-8 files and creates directories', async () => {
            const content = 'héllo 👋\n';
            await workspace.writeFile('a/b/ü.txt', content);
            expect(await workspace.readFile('a/b/ü.txt')).toBe(content);
            expect(await workspace.readFile('/workspace/a/b/ü.txt')).toBe(content);
        }, TEST_TIMEOUT_MS);

        it('refuses escaping, missing and oversized files', async () => {
            await expect(workspace.readFile('../x')).rejects.toBeInstanceOf(ValidationError);
            await expect(workspace.readFile('')).rejects.toBeInstanceOf(ValidationError);
            await expect(workspace.readFile('missing.txt')).rejects.toBeInstanceOf(SandboxError);
            await expect(workspace.writeFile('big', 'a'.repeat(1_048_577))).rejects.toBeInstanceOf(ValidationError);

            const created = await workspace.exec(['sh', '-c', 'head -c 1048577 /dev/zero > big2']);
            expect(created.exitCode).toBe(0);
            await expect(workspace.readFile('big2')).rejects.toBeInstanceOf(SandboxError);
        }, TEST_TIMEOUT_MS);

        it('has a writable HOME', async () => {
            const result = await workspace.exec(['sh', '-c', 'touch "$HOME/.probe" && echo ok']);
            expect(result.stdout).toBe('ok\n');
        }, TEST_TIMEOUT_MS);

        it('is unusable after dispose and disposes idempotently', async () => {
            const own = await factory();
            expect(own.disposed).toBe(false);
            await own.dispose();
            expect(own.disposed).toBe(true);
            await own.dispose();
            await expect(own.exec(['true'])).rejects.toBeInstanceOf(SandboxError);
            await expect(own.readFile('x')).rejects.toBeInstanceOf(SandboxError);
        }, TEST_TIMEOUT_MS);

        it('settles an exec when disposed', async () => {
            const own = await factory();
            const started = Date.now();
            const pending = own.exec(['sleep', '30']);
            const settled = expect(pending).rejects.toThrow(/disposed/);
            await sleep(200);
            await own.dispose();
            await settled;
            await expect(pending).rejects.toBeInstanceOf(SandboxError);
            expect(Date.now() - started).toBeLessThan(10_000);
        }, TEST_TIMEOUT_MS);
    });
}
