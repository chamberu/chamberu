/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    mkdir,
    mkdtemp,
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
} from 'vitest';
import { SandboxError } from '@chamberu/core';
import { createLocalSandbox } from '@chamberu/sandbox-local';
import { ControllableClock } from '@chamberu/test-kit';

describe('local garbage collection', () => {
    let root: string;

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'chamberu-local-gc-'));
    });

    afterEach(async () => {
        await rm(root, { recursive: true, force: true });
    });

    it('deletes expired workspaces only', async () => {
        const clock = new ControllableClock();
        const provider = createLocalSandbox({ root, clock });
        const first = await provider.create({ runId: 'r1', limits: { timeoutMs: 1_000 } });
        const second = await provider.create({ runId: 'r2', limits: { timeoutMs: 60_000 } });
        const foreign = join(root, 'not-a-workspace');
        await mkdir(foreign);

        clock.advance(1_000);
        expect(await provider.collectGarbage()).toBe(1);

        expect((await readdir(root)).sort()).toEqual([second.id, 'not-a-workspace'].sort());
        await expect(first.exec(['true'])).rejects.toBeInstanceOf(SandboxError);
        expect((await second.exec(['true'])).exitCode).toBe(0);

        await second.dispose();
    });

    it('deletes expired workspaces another process left behind', async () => {
        const clock = new ControllableClock(new Date(10_000));
        const id = '00000000-0000-4000-8000-000000000000';
        await mkdir(join(root, id, 'repo'), { recursive: true });
        await writeFile(join(root, id, 'workspace.json'), JSON.stringify({ runId: 'r0', expiresAt: new Date(5_000).toISOString() }));
        await mkdir(join(root, 'broken'));
        await writeFile(join(root, 'broken', 'workspace.json'), 'not json');

        expect(await createLocalSandbox({ root, clock }).collectGarbage()).toBe(1);
        expect(await readdir(root)).toEqual(['broken']);
    });

    it('collects nothing without a root directory', async () => {
        expect(await createLocalSandbox({ root: join(root, 'missing') }).collectGarbage()).toBe(0);
    });
});
