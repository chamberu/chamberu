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
    SANDBOX_LABELS,
    WORKSPACE_LABEL,
    assertSandboxEnv,
    createRemoteWorkspace,
    prepareWorkspace,
    resolveLimits,
} from '@chamberu/sandbox';
import type { ISandboxProvider, IWorkspace, WorkspaceInfo } from '@chamberu/sandbox';
import { createPodClient } from '../client/module.ts';
import { createPodTransport } from '../transport/module.ts';
import {
    POD_NAME_PREFIX,
    POLL_MS,
    START_TIMEOUT_MS,
} from './constants.ts';
import {
    assertKubernetesOptions,
    buildPod,
    delay,
    guard,
    isExpired,
    loadDefaultKubeConfig,
    podState,
} from './helpers.ts';
import type { KubernetesSandboxOptions } from './types.ts';

const PROVIDER_NAME = 'k8s';

const MANAGED_SELECTOR = Object.entries(SANDBOX_LABELS).map(([key, value]) => `${key}=${value}`).join(',');

/**
 * One hardened pod per workspace (see `buildPod`), commands run through the
 * pod exec API inside GNU `timeout`. `create` waits for the pod to run
 * (polling its status on the clock, failing fast on image and config errors),
 * then checks out. Creating the provider contacts nothing.
 */
export function createKubernetesSandbox(options: KubernetesSandboxOptions): ISandboxProvider {
    assertKubernetesOptions(options);

    const { namespace } = options;
    const client = options.client ?? createPodClient({
        kubeConfig: options.kubeConfig ?? loadDefaultKubeConfig(),
        namespace,
    });
    const image = options.image ?? DEFAULT_SANDBOX_IMAGE;
    const imagePullPolicy = options.imagePullPolicy ?? 'IfNotPresent';
    const startTimeoutMs = options.startTimeoutMs ?? START_TIMEOUT_MS;
    const pollMs = options.pollMs ?? POLL_MS;
    const clock = options.clock ?? systemClock;
    const live = new Map<string, IWorkspace>();

    /** Resolves once the pod runs; SandboxError when it never will, takes too long or the signal fires. */
    async function waitForRunning(name: string, signal?: AbortSignal): Promise<void> {
        const started = clock.now().getTime();
        for (;;) {
            if (signal?.aborted) throw new SandboxError('workspace creation aborted');
            const state = podState(await client.read(name));
            if (state.state === 'running') return;
            if (state.state === 'failed') {
                throw new SandboxError(`workspace pod ${name} cannot start: ${state.reason}`);
            }
            const remaining = started + startTimeoutMs - clock.now().getTime();
            if (remaining <= 0) {
                throw new SandboxError(`workspace pod ${name} did not start within ${startTimeoutMs} ms.`);
            }
            await delay(clock, Math.min(pollMs, remaining), signal);
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

            const id = randomUUID();
            const name = `${POD_NAME_PREFIX}${id}`;
            const createdAt = clock.now();
            const expiresAt = new Date(createdAt.getTime() + limits.timeoutMs);
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
                transport: createPodTransport(client, name),
                clock,
            });
            const workspace: IWorkspace = {
                id,
                info,
                exec: remote.exec,
                readFile: remote.readFile,
                writeFile: remote.writeFile,
                async dispose() {
                    await remote.dispose();
                    live.delete(id);
                },
            };

            try {
                live.set(id, workspace);
                await client.create(buildPod({
                    id,
                    runId: input.runId,
                    namespace,
                    image: input.image ?? image,
                    env: { ...options.env, ...input.env },
                    limits,
                    expiresAt,
                    labels: options.podLabels ?? {},
                    imagePullPolicy,
                }));
                await waitForRunning(name, input.signal);
                const { commit } = await prepareWorkspace(workspace, {
                    repo: input.repo,
                    ref: input.ref,
                    signal: input.signal,
                });
                if (commit !== undefined) info.commit = commit;
            } catch (error) {
                // deleting a pod that was never created is a 404, which is fine
                await workspace.dispose().catch(() => undefined);
                if (error instanceof ChamberuError) throw error;
                throw new SandboxError(`cannot start workspace pod ${name}`, { cause: error });
            }
            return workspace;
        },

        async collectGarbage() {
            const pods = await guard('list the workspace pods', () => client.list(MANAGED_SELECTOR));
            const now = clock.now().getTime();
            let count = 0;
            for (const pod of pods) {
                const name = pod.metadata?.name;
                if (!name) continue;
                const phase = pod.status?.phase;
                if (!isExpired(pod, now) && phase !== 'Failed' && phase !== 'Succeeded') continue;

                // one open here is disposed, so its in-flight commands settle too
                const workspace = live.get(pod.metadata?.labels?.[WORKSPACE_LABEL] ?? '');
                await guard(`delete workspace pod ${name}`, () => (workspace ? workspace.dispose() : client.delete(name)));
                count++;
            }
            return count;
        },
    };
}
