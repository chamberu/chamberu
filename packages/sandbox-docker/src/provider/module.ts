/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomUUID } from 'node:crypto';
import {
    ChamberuError,
    SandboxError,
    ValidationError,
    systemClock,
} from '@chamberu/core';
import {
    DEFAULT_SANDBOX_IMAGE,
    EXPIRES_AT_KEY,
    SANDBOX_LABELS,
    WORKSPACE_LABEL,
    assertSandboxEnv,
    createRemoteWorkspace,
    prepareWorkspace,
    resolveLimits,
} from '@chamberu/sandbox';
import type { ISandboxProvider, IWorkspace, WorkspaceInfo } from '@chamberu/sandbox';
import Docker from 'dockerode';
import { createDockerTransport } from '../transport/module.ts';
import { DEFAULT_NETWORK } from './constants.ts';
import {
    assertDockerOptions,
    buildContainerOptions,
    dockerMessage,
    isMissingImage,
    pullImage,
    removeContainer,
} from './helpers.ts';
import type { DockerSandboxOptions } from './types.ts';

const PROVIDER_NAME = 'docker';

/**
 * One hardened container per workspace (see `buildContainerOptions`), commands
 * run through the Docker exec API inside GNU `timeout`. The client connects
 * lazily, so creating the provider never contacts the daemon.
 */
export function createDockerSandbox(options: DockerSandboxOptions = {}): ISandboxProvider {
    assertDockerOptions(options);

    const docker = options.docker ?? new Docker();
    const image = options.image ?? DEFAULT_SANDBOX_IMAGE;
    const network = options.network ?? DEFAULT_NETWORK;
    const pull = options.pull ?? 'missing';
    const clock = options.clock ?? systemClock;
    const live = new Map<string, IWorkspace>();

    async function createContainer(createOptions: Docker.ContainerCreateOptions, imageName: string): Promise<Docker.Container> {
        if (pull === 'always') await pullImage(docker, imageName);
        try {
            return await docker.createContainer(createOptions);
        } catch (error) {
            if (pull !== 'missing' || !isMissingImage(error)) {
                throw new SandboxError(`cannot create a workspace container from ${imageName}: ${dockerMessage(error)}`, { cause: error });
            }
        }

        // the image is not present: pull it once, then try again
        await pullImage(docker, imageName);
        try {
            return await docker.createContainer(createOptions);
        } catch (error) {
            throw new SandboxError(`cannot create a workspace container from ${imageName}: ${dockerMessage(error)}`, { cause: error });
        }
    }

    return {
        name: PROVIDER_NAME,

        async create(input) {
            if (typeof input?.runId !== 'string' || input.runId.length === 0) {
                throw new ValidationError('runId must be a non-empty string.');
            }
            if (input.image !== undefined && (typeof input.image !== 'string' || input.image.length === 0 || input.image.includes('\0'))) {
                throw new ValidationError('image must be a non-empty string.');
            }
            assertSandboxEnv(input.env);
            if (input.signal?.aborted) {
                throw new SandboxError('workspace creation aborted');
            }
            const limits = resolveLimits(options.limits, input.limits);
            const imageName = input.image ?? image;

            const id = randomUUID();
            const createdAt = clock.now();
            const expiresAt = new Date(createdAt.getTime() + limits.timeoutMs);
            const container = await createContainer(buildContainerOptions({
                id,
                runId: input.runId,
                image: imageName,
                network,
                env: { ...options.env, ...input.env },
                limits,
                expiresAt,
            }), imageName);

            const info: WorkspaceInfo = {
                runId: input.runId,
                provider: PROVIDER_NAME,
                createdAt,
                expiresAt,
            };
            if (input.repo !== undefined) info.repo = input.repo;
            if (input.ref !== undefined) info.ref = input.ref;

            const remote = createRemoteWorkspace({
                id,
                info,
                transport: createDockerTransport(docker, container, clock),
                clock,
            });
            const workspace: IWorkspace = {
                id,
                info,
                get disposed() {
                    return remote.disposed;
                },
                exec: remote.exec,
                readFile: remote.readFile,
                writeFile: remote.writeFile,
                async dispose() {
                    await remote.dispose();
                    live.delete(id);
                },
            };
            live.set(id, workspace);

            try {
                await container.start();
                if (input.signal?.aborted) {
                    throw new SandboxError('workspace creation aborted');
                }
                const { commit } = await prepareWorkspace(workspace, {
                    repo: input.repo,
                    ref: input.ref,
                    signal: input.signal,
                });
                if (commit !== undefined) info.commit = commit;
            } catch (error) {
                await workspace.dispose().catch(() => undefined);
                if (error instanceof ChamberuError) throw error;
                throw new SandboxError(`cannot start workspace container ${id}: ${dockerMessage(error)}`, { cause: error });
            }
            return workspace;
        },

        async collectGarbage() {
            let containers: Docker.ContainerInfo[];
            try {
                containers = await docker.listContainers({
                    all: true,
                    filters: { label: Object.entries(SANDBOX_LABELS).map(([key, value]) => `${key}=${value}`) },
                });
            } catch (error) {
                throw new SandboxError(`cannot list the workspace containers: ${dockerMessage(error)}`, { cause: error });
            }

            const now = clock.now().getTime();
            let count = 0;
            for (const container of containers) {
                const labels = container.Labels ?? {};
                const expiresAt = Number(labels[EXPIRES_AT_KEY]);
                if (!labels[EXPIRES_AT_KEY] || !Number.isFinite(expiresAt) || expiresAt > now) continue;

                // one open here is disposed, so its in-flight commands settle too
                const workspace = live.get(labels[WORKSPACE_LABEL] ?? '');
                try {
                    if (workspace) {
                        await workspace.dispose();
                    } else {
                        await removeContainer(docker.getContainer(container.Id));
                    }
                } catch (error) {
                    if (error instanceof SandboxError) throw error;
                    throw new SandboxError(`cannot remove workspace container ${container.Id}: ${dockerMessage(error)}`, { cause: error });
                }
                count++;
            }
            return count;
        },
    };
}
