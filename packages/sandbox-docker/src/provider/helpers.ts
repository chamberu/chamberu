/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    EXPIRES_AT_KEY,
    RUN_LABEL,
    SANDBOX_ENV,
    SANDBOX_LABELS,
    TMP_SIZE,
    WORKSPACE_LABEL,
    WORKSPACE_ROOT,
    parseCpu,
    parseMemory,
} from '@chamberu/sandbox';
import type Dockerode from 'dockerode';
import { CONTAINER_NAME_PREFIX, SANDBOX_USER } from './constants.ts';
import type { ContainerOptionsInput } from './types.ts';

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
