/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IWorkspace } from '../workspace/types.ts';

export type SandboxLimits = {
    /** Kubernetes quantity, e.g. `'1'`, `'500m'`. */
    cpu?: string;
    /** Bytes as a Kubernetes quantity, e.g. `'2Gi'`. */
    memory?: string;
    /** Disk of `/workspace`, e.g. `'4Gi'`. */
    storage?: string;
    pids?: number;
    /** Lifetime of the workspace. */
    timeoutMs?: number;
};

export type WorkspaceCreateOptions = {
    runId: string;
    /** A normalized repository URL (`normalizeRepo`); without it the workspace is only `git init`-ed. */
    repo?: string;
    ref?: string;
    image?: string;
    env?: Record<string, string>;
    limits?: SandboxLimits;
    signal?: AbortSignal;
};

export interface ISandboxProvider {
    readonly name: string;
    /**
     * A ready workspace (id `randomUUID()`), checked out when `repo` is given
     * (via `prepareWorkspace`, then `info.commit = commit`).
     */
    create(options: WorkspaceCreateOptions): Promise<IWorkspace>;
    /** Deletes this provider's workspaces past their expiry; returns how many. */
    collectGarbage(): Promise<number>;
}
