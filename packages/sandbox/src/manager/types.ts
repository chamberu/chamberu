/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ToolSet } from 'ai';
import type { Engine, IClock } from '@chamberu/core';
import type { ISandboxProvider, SandboxLimits } from '../provider/types.ts';
import type { IWorkspace } from '../workspace/types.ts';

export type WorkspaceManagerOptions = {
    provider: ISandboxProvider;
    /** Passed to every `create`. */
    image?: string;
    /** Passed to every `create`. */
    env?: Record<string, string>;
    /** Passed to every `create`. */
    limits?: SandboxLimits;
    /** Accept `file:///absolute/path` repositories (local development and tests). Default false. */
    allowFileRepos?: boolean;
    /** Narrows the accepted repositories further; gets the normalized URL. */
    allowRepo?: (url: string) => boolean;
    /** Workspaces one run may hold at once. Default MAX_WORKSPACES_PER_RUN (3). */
    maxWorkspacesPerRun?: number;
    /** Minimum interval between the garbage collections `acquire` starts. Default GC_INTERVAL_MS; 0 disables them. */
    gcIntervalMs?: number;
    clock?: IClock;
    /** Background failures (disposal, garbage collection). Default console.error. */
    onError?: (error: unknown) => void;
};

export type AcquireInput = {
    /** `owner/name`, an https URL, or `file:///absolute/path` with `allowFileRepos`. */
    repo?: string;
    ref?: string;
    signal?: AbortSignal;
};

export type AcquireResult = {
    workspace: IWorkspace;
    /** True when the run already held (or was creating) the workspace of this repository. */
    reused: boolean;
};

/**
 * Run-scoped workspaces: one per run and repository (or none), created
 * through the provider and disposed when the run settles (`attach`).
 */
export interface IWorkspaceManager {
    /**
     * The run's workspace of `repo` (none: the repo-less one), created when
     * missing, expired or gone (`IWorkspace.disposed`). Concurrent calls share one create. ValidationError for a
     * repository or ref the rules refuse; SandboxError for another ref of a
     * held repository, a reached per-run cap or a failed create.
     */
    acquire(runId: string, input: AcquireInput): Promise<AcquireResult>;
    /**
     * The run's workspace by id, or its only live one when id is omitted
     * (expired and gone ones are disposed first). SandboxError: unknown,
     * expired or gone (disposed then), none; ValidationError: several and no id.
     */
    get(runId: string, workspaceId?: string): IWorkspace;
    /**
     * Disposes one workspace (SandboxError /not found/ for an id the run does
     * not hold, like get), or all of the run (never rejects for none).
     */
    release(runId: string, workspaceId?: string): Promise<void>;
    /**
     * Disposes a run's workspaces on completed | failed | cancelled. Returns the
     * unsubscribe; after close() it subscribes nothing.
     */
    attach(engine: Pick<Engine, 'on'>): () => void;
    /** `create_workspace` and `dispose_workspace`. */
    tools(): ToolSet;
    /** Disposes the manager's expired workspaces, then runs the provider's collection; returns how many went. */
    collectGarbage(): Promise<number>;
    /**
     * Unsubscribes every attach and disposes every workspace (call after
     * engine.drain()); afterwards acquire rejects and attach subscribes nothing.
     */
    close(): Promise<void>;
}

export type WorkspaceToolResult = {
    workspace: string;
    root: '/workspace';
    repo: string | null;
    ref: string | null;
    commit: string | null;
    expiresAt: string;
    reused: boolean;
};

export type DisposeWorkspaceResult = {
    workspace: string;
    disposed: true;
};
