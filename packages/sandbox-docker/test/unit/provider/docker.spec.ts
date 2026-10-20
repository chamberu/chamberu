/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomUUID } from 'node:crypto';
import Docker from 'dockerode';
import {
    afterAll,
    expect,
    it,
} from 'vitest';
import { SandboxError } from '@chamberu/core';
import type { IWorkspace } from '@chamberu/sandbox';
import { CONTAINER_NAME_PREFIX, createDockerSandbox } from '@chamberu/sandbox-docker';
import { describeDocker, dockerImage } from '../../utils/docker.ts';

const offline = Boolean(process.env.CHAMBERU_OFFLINE);

const MISSING_IMAGE = 'chamberu/does-not-exist:none';

function statusCode(error: unknown): number | undefined {
    return (error as { statusCode?: number } | undefined)?.statusCode;
}

describeDocker('docker sandbox', () => {
    const docker = new Docker();
    const workspaces: IWorkspace[] = [];

    async function create(options: Parameters<typeof createDockerSandbox>[0] = {}, input: { repo?: string; ref?: string } = {}) {
        const runId = `test-${randomUUID()}`;
        const workspace = await createDockerSandbox({ image: dockerImage, ...options }).create({ runId, ...input });
        workspaces.push(workspace);
        return { runId, workspace };
    }

    async function containersOf(runId: string) {
        return docker.listContainers({ all: true, filters: { label: [`chamberu.dev/run=${runId}`] } });
    }

    afterAll(async () => {
        await Promise.all(workspaces.map((workspace) => workspace.dispose().catch(() => undefined)));
    });

    it('labels the container with its run', async () => {
        const { runId, workspace } = await create();
        const containers = await containersOf(runId);
        expect(containers).toHaveLength(1);
        expect(containers[0]?.Labels['chamberu.dev/workspace']).toBe(workspace.id);
        expect(containers[0]?.Names).toEqual([`/${CONTAINER_NAME_PREFIX}${workspace.id}`]);
        expect(workspace.info).toMatchObject({ runId, provider: 'docker' });
    });

    it('dispose removes container and volume', async () => {
        const { workspace } = await create();
        const container = docker.getContainer(`${CONTAINER_NAME_PREFIX}${workspace.id}`);
        const volume = (await container.inspect()).Mounts[0]?.Name as string;
        expect(volume).toBeTruthy();

        await workspace.dispose();

        await expect(container.inspect()).rejects.toSatisfy((error) => statusCode(error) === 404);
        await expect(docker.getVolume(volume).inspect()).rejects.toSatisfy((error) => statusCode(error) === 404);
    });

    it.skipIf(offline)('clones a public repository', async () => {
        const { workspace } = await create({}, { repo: 'https://github.com/octocat/Hello-World.git', ref: 'master' });
        expect(await workspace.readFile('README')).toContain('Hello World');
        expect(workspace.info.commit).toMatch(/^[0-9a-f]{40}$/);
    });

    it('network none has no network', async () => {
        const { workspace } = await create({ network: 'none' });
        const result = await workspace.exec(['getent', 'hosts', 'github.com']);
        expect(result.exitCode).not.toBe(0);

        const runId = `test-${randomUUID()}`;
        await expect(createDockerSandbox({ image: dockerImage, network: 'none' }).create({
            runId,
            repo: 'https://github.com/octocat/Hello-World.git',
        })).rejects.toBeInstanceOf(SandboxError);
        expect(await containersOf(runId)).toEqual([]);
    });

    it('does not pass the host environment', async () => {
        process.env.CHAMBERU_SECRET_PROBE = 's3cret';
        try {
            const { workspace } = await create({ env: { VISIBLE: 'yes' } });
            const result = await workspace.exec(['env']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout).not.toContain('s3cret');
            expect(result.stdout).toContain('VISIBLE=yes');
        } finally {
            delete process.env.CHAMBERU_SECRET_PROBE;
        }
    });

    it('applies limits', async () => {
        const { workspace } = await create({ limits: { memory: '256Mi', pids: 64 } });
        const info = await docker.getContainer(`${CONTAINER_NAME_PREFIX}${workspace.id}`).inspect();
        expect(info.HostConfig.Memory).toBe(268_435_456);
        expect(info.HostConfig.PidsLimit).toBe(64);
    });

    it('a missing image fails cleanly', async () => {
        const runId = `test-${randomUUID()}`;
        await expect(createDockerSandbox({ image: MISSING_IMAGE, pull: 'never' }).create({ runId }))
            .rejects.toBeInstanceOf(SandboxError);
        expect(await containersOf(runId)).toEqual([]);
    });

    it.skipIf(offline)('a failed pull fails cleanly', async () => {
        const runId = `test-${randomUUID()}`;
        const error = await createDockerSandbox({ image: MISSING_IMAGE, pull: 'missing' })
            .create({ runId })
            .catch((e: unknown) => e);
        expect(error).toBeInstanceOf(SandboxError);
        expect((error as Error).message).toContain(`cannot pull the image ${MISSING_IMAGE}`);
        expect(await containersOf(runId)).toEqual([]);
    });

    it.skipIf(offline)('pull always pulls', async () => {
        const runId = `test-${randomUUID()}`;
        // the test image is a local-only tag, so a pull must fail
        const error = await createDockerSandbox({ image: dockerImage, pull: 'always' })
            .create({ runId })
            .catch((e: unknown) => e);
        expect(error).toBeInstanceOf(SandboxError);
        expect((error as Error).message).toContain(dockerImage as string);
        expect(await containersOf(runId)).toEqual([]);
    });
});
