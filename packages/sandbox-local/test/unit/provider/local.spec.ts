/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    mkdtemp,
    readFile,
    readdir,
    rm,
    writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import { InvalidAgentDefinitionError, SandboxError } from '@chamberu/core';
import { createLocalSandbox } from '@chamberu/sandbox-local';
import { ControllableClock, createGitFixture } from '@chamberu/test-kit';

const sleep = (ms: number) => new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
});

async function waitFor<T>(probe: () => Promise<T | undefined>, timeoutMs = 10_000): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const value = await probe();
        if (value !== undefined) return value;
        await sleep(25);
    }
    throw new Error('waitFor timed out');
}

function isAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false;
        throw error;
    }
}

describe('local sandbox', () => {
    let tmp: string;
    let root: string;

    beforeEach(async () => {
        tmp = await mkdtemp(join(tmpdir(), 'chamberu-local-spec-'));
        root = join(tmp, 'workspaces');
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await rm(tmp, { recursive: true, force: true });
    });

    it('checks out a fixture repository', async () => {
        const fixture = await createGitFixture({ 'README.md': '# demo\n' });
        try {
            const workspace = await createLocalSandbox({ root }).create({
                runId: 'r1',
                repo: fixture.url,
                ref: 'v1',
            });
            try {
                expect(await workspace.readFile('README.md')).toBe('# demo\n');
                expect(workspace.info.commit).toBe(fixture.commit);
                expect(workspace.info.repo).toBe(fixture.url);
                expect(workspace.info.ref).toBe('v1');
                expect(workspace.info.provider).toBe('local');
                expect(workspace.info.runId).toBe('r1');
            } finally {
                await workspace.dispose();
            }
        } finally {
            await fixture.cleanup();
        }
    }, 30_000);

    it('does not leak the host environment', async () => {
        process.env.CHAMBERU_SECRET_PROBE = 's3cret';
        try {
            const workspace = await createLocalSandbox({ root, env: { FOO: 'bar' } }).create({ runId: 'r1' });
            try {
                const { stdout } = await workspace.exec(['env']);
                expect(stdout).not.toContain('s3cret');
                expect(stdout).toContain('PATH=');
                expect(stdout).toContain('GIT_TERMINAL_PROMPT=0');
                expect(stdout).toContain('GIT_CONFIG_NOSYSTEM=1');
                expect(stdout).toContain('FOO=bar');
            } finally {
                await workspace.dispose();
            }
        } finally {
            delete process.env.CHAMBERU_SECRET_PROBE;
        }
    });

    it('ignores the system git config', async () => {
        const config = join(tmp, 'gitconfig');
        await writeFile(config, '[credential]\n\thelper = store\n');
        const workspace = await createLocalSandbox({ root, env: { GIT_CONFIG_SYSTEM: config } }).create({ runId: 'r1' });
        try {
            const ignored = await workspace.exec(['git', 'config', '--get', 'credential.helper']);
            expect(ignored.exitCode).toBe(1);
            expect(ignored.stdout).toBe('');

            // the probe works: without GIT_CONFIG_NOSYSTEM git reads the file
            const probe = await workspace.exec(['env', '-u', 'GIT_CONFIG_NOSYSTEM', 'git', 'config', '--get', 'credential.helper']);
            expect(probe.stdout).toBe('store\n');
        } finally {
            await workspace.dispose();
        }
    });

    it('kills a running exec on dispose', async () => {
        const workspace = await createLocalSandbox({ root }).create({ runId: 'r1' });
        const pidFile = join(tmp, 'pid');
        const pending = workspace.exec(['sh', '-c', 'sleep 30 & echo $! > "$1"; wait', 'sh', pidFile]);
        const settled = expect(pending).rejects.toThrow(/disposed/);

        const pid = await waitFor(async () => {
            const text = await readFile(pidFile, 'utf8').catch(() => '');
            return text.trim() ? Number(text.trim()) : undefined;
        });
        expect(isAlive(pid)).toBe(true);

        await workspace.dispose();
        await settled;
        await waitFor(async () => (isAlive(pid) ? undefined : true), 2_000);
    }, 30_000);

    it('clears the kill timer when the child exits', async () => {
        const clock = new ControllableClock();
        const workspace = await createLocalSandbox({ root, clock }).create({ runId: 'r1' });
        try {
            const result = await workspace.exec(['true'], { timeoutMs: 1_000 });
            expect(result.exitCode).toBe(0);

            const kill = vi.spyOn(process, 'kill');
            clock.advance(1_000);
            expect(kill).not.toHaveBeenCalled();
        } finally {
            vi.restoreAllMocks();
            await workspace.dispose();
        }
    });

    it('disposes a failed checkout', async () => {
        const fixture = await createGitFixture({ 'README.md': '# demo\n' });
        try {
            await expect(createLocalSandbox({ root }).create({
                runId: 'r1',
                repo: fixture.url,
                ref: 'nope',
            })).rejects.toBeInstanceOf(SandboxError);
            expect(await readdir(root)).toEqual([]);
        } finally {
            await fixture.cleanup();
        }
    }, 30_000);

    it('kills on the clock', async () => {
        const clock = new ControllableClock();
        const workspace = await createLocalSandbox({ root, clock }).create({ runId: 'r1' });
        try {
            const pending = workspace.exec(['sleep', '30'], { timeoutMs: 1_000 });
            // let the child start before the timer fires
            await sleep(100);
            clock.advance(1_000);
            const result = await pending;
            expect(result.timedOut).toBe(true);
            expect(result.exitCode).toBe(137);
            expect(result.durationMs).toBe(1_000);
        } finally {
            await workspace.dispose();
        }
    }, 30_000);

    it('refuses exec past expiry', async () => {
        const clock = new ControllableClock();
        const workspace = await createLocalSandbox({
            root,
            clock,
            limits: { timeoutMs: 60_000 },
        }).create({ runId: 'r1' });
        try {
            expect(workspace.info.expiresAt.getTime() - workspace.info.createdAt.getTime()).toBe(60_000);
            clock.advance(60_000);
            await expect(workspace.exec(['true'])).rejects.toThrow(/expired/);
            await expect(workspace.exec(['true'])).rejects.toBeInstanceOf(SandboxError);
            await expect(workspace.readFile('x')).rejects.toThrow(/expired/);
        } finally {
            await workspace.dispose();
        }
    });

    it('caps an exec timeout at the expiry', async () => {
        const clock = new ControllableClock();
        const workspace = await createLocalSandbox({
            root,
            clock,
            limits: { timeoutMs: 2_000 },
        }).create({ runId: 'r1' });
        try {
            const pending = workspace.exec(['sleep', '30'], { timeoutMs: 60_000 });
            await sleep(100);
            clock.advance(2_000);
            expect(await pending).toMatchObject({ timedOut: true, exitCode: 137 });
        } finally {
            await workspace.dispose();
        }
    }, 30_000);

    it('rejects invalid options', () => {
        expect(() => createLocalSandbox({ env: { 'A-B': 'x' } })).toThrow(InvalidAgentDefinitionError);
        expect(() => createLocalSandbox({ limits: { timeoutMs: 10 } })).toThrow(InvalidAgentDefinitionError);
        expect(() => createLocalSandbox({ root: '' })).toThrow(InvalidAgentDefinitionError);
    });

    it('writes the workspace record and removes the directory on dispose', async () => {
        const workspace = await createLocalSandbox({ root }).create({ runId: 'r1' });
        const record = JSON.parse(await readFile(join(root, workspace.id, 'workspace.json'), 'utf8'));
        expect(record).toEqual({ runId: 'r1', expiresAt: workspace.info.expiresAt.toISOString() });
        await workspace.dispose();
        expect(await readdir(root)).toEqual([]);
    });
});
