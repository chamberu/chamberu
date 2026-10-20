/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError, SandboxError } from '@chamberu/core';
import {
    EXPIRES_AT_KEY,
    RUN_LABEL,
    SANDBOX_ENV,
    SANDBOX_LABELS,
    TMP_SIZE,
    WORKSPACE_LABEL,
    WORKSPACE_ROOT,
    assertSandboxEnv,
    parseCpu,
    parseMemory,
    resolveLimits,
} from '@chamberu/sandbox';
import type Dockerode from 'dockerode';
import { isObject } from 'smob';
import { CONTAINER_NAME_PREFIX, SANDBOX_USER } from './constants.ts';
import type { ContainerOptionsInput, DockerSandboxOptions } from './types.ts';

const PULL_POLICIES = ['missing', 'always', 'never'];

function isName(value: unknown): boolean {
    return typeof value === 'string' && value.length > 0 && !value.includes('\0');
}

/** Checks the provider options; InvalidAgentDefinitionError for a misconfiguration. */
export function assertDockerOptions(options: DockerSandboxOptions): void {
    if (!isObject(options)) {
        throw new InvalidAgentDefinitionError('createDockerSandbox() options must be an object.');
    }
    const { docker, clock } = options;
    if (
        docker !== undefined &&
        (!isObject(docker) ||
            typeof docker.createContainer !== 'function' ||
            typeof docker.getContainer !== 'function' ||
            typeof docker.listContainers !== 'function' ||
            typeof docker.pull !== 'function' ||
            !isObject(docker.modem) ||
            typeof docker.modem.demuxStream !== 'function' ||
            typeof docker.modem.followProgress !== 'function')
    ) {
        throw new InvalidAgentDefinitionError('docker must be a dockerode client.');
    }
    if (options.image !== undefined && !isName(options.image)) {
        throw new InvalidAgentDefinitionError('image must be a non-empty string.');
    }
    if (options.network !== undefined && !isName(options.network)) {
        throw new InvalidAgentDefinitionError('network must be a non-empty string.');
    }
    if (options.pull !== undefined && !PULL_POLICIES.includes(options.pull)) {
        throw new InvalidAgentDefinitionError(`pull must be one of ${PULL_POLICIES.join(', ')}, got ${JSON.stringify(options.pull)}.`);
    }
    if (clock !== undefined && (!isObject(clock) || typeof clock.now !== 'function' || typeof clock.setTimeout !== 'function')) {
        throw new InvalidAgentDefinitionError('clock must be an IClock.');
    }
    assertSandboxEnv(options.env);
    resolveLimits(options.limits);
}

/** True when a create failed because the image is not present (a 404 also answers a missing network). */
export function isMissingImage(error: unknown): boolean {
    return isStatus(error, 404) && /no such image/i.test(dockerMessage(error));
}

/** True when a dockerode error carries this HTTP status. */
export function isStatus(error: unknown, status: number): boolean {
    return isObject(error) && error.statusCode === status;
}

/** The daemon's own message when it sent one, else the error's. */
export function dockerMessage(error: unknown): string {
    if (isObject(error)) {
        const { json } = error;
        if (isObject(json) && typeof json.message === 'string') return json.message;
        if (typeof error.message === 'string') return error.message;
    }
    return String(error);
}

/** Removes a container and its anonymous volumes; a missing one, or one already being removed, is fine. */
export async function removeContainer(container: Dockerode.Container): Promise<void> {
    try {
        await container.remove({ force: true, v: true });
    } catch (error) {
        if (isStatus(error, 404) || (isStatus(error, 409) && /already in progress/i.test(dockerMessage(error)))) {
            return;
        }
        throw error;
    }
}

/** The error of a create that `signal` stopped. */
export function abortedCreate(cause?: unknown): SandboxError {
    return new SandboxError('workspace creation aborted', cause === undefined ? undefined : { cause });
}

/**
 * Pulls an image to the end of its progress stream; SandboxError naming the
 * image on any failure. `signal` drops the request and the progress stream
 * (the daemon may finish the pull on its own).
 */
export async function pullImage(docker: Dockerode, image: string, signal?: AbortSignal): Promise<void> {
    try {
        const stream = await docker.pull(image, signal ? { abortSignal: signal } : {}) as NodeJS.ReadableStream & { destroy?(): void };
        await new Promise<void>((resolve, reject) => {
            const onAbort = () => {
                stream.destroy?.();
                reject(abortedCreate());
            };
            if (signal?.aborted) {
                onAbort();
                return;
            }
            signal?.addEventListener('abort', onAbort, { once: true });
            docker.modem.followProgress(stream, (error: Error | null, output: Array<{ error?: unknown }>) => {
                signal?.removeEventListener('abort', onAbort);
                const failed = (output ?? []).find((event) => typeof event?.error === 'string');
                if (error) {
                    reject(error);
                } else if (failed) {
                    reject(new Error(String(failed.error)));
                } else {
                    resolve();
                }
            });
        });
    } catch (error) {
        if (signal?.aborted) throw abortedCreate(error);
        throw new SandboxError(`cannot pull the image ${image}: ${dockerMessage(error)}`, { cause: error });
    }
}

/**
 * The create options of one workspace container: uid 1000, read-only root,
 * no capabilities, no-new-privileges, pid/memory/cpu limits, a `/tmp` tmpfs,
 * an anonymous `/workspace` volume and only `SANDBOX_ENV` plus the configured
 * `env` (never the host's). It sleeps for its lifetime, so an expired
 * container stops by itself even when nothing collects it.
 */
export function buildContainerOptions(input: ContainerOptionsInput): Dockerode.ContainerCreateOptions {
    // Docker takes whole bytes; a quantity like '1.1Gi' is fractional
    const memory = Math.round(parseMemory(input.limits.memory));
    const env = { ...SANDBOX_ENV, ...input.env };

    return {
        name: `${CONTAINER_NAME_PREFIX}${input.id}`,
        Image: input.image,
        Cmd: ['sleep', String(Math.ceil(input.limits.timeoutMs / 1000))],
        User: SANDBOX_USER,
        WorkingDir: WORKSPACE_ROOT,
        Env: Object.entries(env).map(([key, value]) => `${key}=${value}`),
        Labels: {
            ...SANDBOX_LABELS,
            [RUN_LABEL]: input.runId,
            [WORKSPACE_LABEL]: input.id,
            [EXPIRES_AT_KEY]: String(input.expiresAt.getTime()),
        },
        HostConfig: {
            NetworkMode: input.network,
            ReadonlyRootfs: true,
            CapDrop: ['ALL'],
            SecurityOpt: ['no-new-privileges:true'],
            Privileged: false,
            PidsLimit: input.limits.pids,
            Memory: memory,
            // equal to Memory: no swap on top
            MemorySwap: memory,
            NanoCpus: Math.round(parseCpu(input.limits.cpu) * 1e9),
            Tmpfs: { '/tmp': `rw,nosuid,nodev,size=${Math.round(parseMemory(TMP_SIZE))}` },
            // anonymous volume, removed with the container (`remove({ v: true })`)
            Mounts: [{
                Type: 'volume',
                Source: '',
                Target: WORKSPACE_ROOT,
            }],
            AutoRemove: false,
        },
    };
}

/**
 * One SandboxError for the removals a garbage collection could not do (the
 * others went on): the count, the first message, every failure in the cause.
 */
export function collectionError(count: number, failures: readonly unknown[]): SandboxError {
    const [first] = failures;
    const message = first instanceof Error ? first.message : String(first);
    return new SandboxError(
        `garbage collection removed ${count} workspaces, ${failures.length} failed (first: ${message})`,
        { cause: new AggregateError(failures) },
    );
}
