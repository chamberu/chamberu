/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    InvalidAgentDefinitionError,
    SandboxError,
    ValidationError,
    systemClock,
} from '@chamberu/core';
import type { ToolSet } from 'ai';
import type { WorkspaceCreateOptions } from '../provider/types.ts';
import { assertGitRef, normalizeRepo } from '../repo/module.ts';
import type { IWorkspace } from '../workspace/types.ts';
import { CLOSE_TIMEOUT_MS, GC_INTERVAL_MS, MAX_WORKSPACES_PER_RUN } from './constants.ts';
import {
    assertManagerOptions,
    isExpired,
    isTerminal,
    toSandboxError,
} from './helpers.ts';
import { createWorkspaceTools } from './tools.ts';
import type {
    AcquireInput,
    AcquireResult,
    CloseOptions,
    IWorkspaceManager,
    WorkspaceManagerOptions,
} from './types.ts';

/** One workspace slot of a run: keyed by the normalized repository URL, or '' without one. */
type Entry = {
    key: string;
    ref?: string;
    workspace?: IWorkspace;
    /** Set while the provider creates the workspace; a pending entry counts toward the cap. */
    pending?: Promise<IWorkspace>;
    /** Aborts the create in flight (combined with the caller's signal); release and close abort it. */
    abort?: AbortController;
};

const NOT_FOUND = 'workspace not found in this run (disposed, expired or never created here); call create_workspace for a new one.';

/**
 * Run-scoped workspaces over `provider`: one per (run, repository), created
 * on `acquire`, disposed on `release`, on expiry (checked on every get), once
 * found gone (`IWorkspace.disposed`, dropped on every get and acquire), when
 * the run settles (`attach`), on `close()` and by garbage collection. A run
 * can only ever reach its own workspaces.
 */
export function createWorkspaceManager(options: WorkspaceManagerOptions): IWorkspaceManager {
    assertManagerOptions(options);
    const { provider } = options;
    const clock = options.clock ?? systemClock;
    const maxPerRun = options.maxWorkspacesPerRun ?? MAX_WORKSPACES_PER_RUN;
    const gcIntervalMs = options.gcIntervalMs ?? GC_INTERVAL_MS;
    // eslint-disable-next-line no-console
    const onError = options.onError ?? ((error: unknown) => console.error('[chamberu]', error));

    const runs = new Map<string, Map<string, Entry>>();
    const subscriptions = new Set<() => void>();
    let lastGcAt: number | undefined;
    let closed = false;
    let tools: ToolSet | undefined;

    /** Every disposal started and not settled yet, with its workspace id: close() waits for them. */
    const disposals = new Map<Promise<void>, string>();

    const disposeOrThrow = (workspace: IWorkspace): Promise<void> => {
        const disposal = (async () => {
            try {
                await workspace.dispose();
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                throw new SandboxError(`workspace dispose failed: ${message}`, { cause: error });
            }
        })();
        disposals.set(disposal, workspace.id);
        const settled = () => {
            disposals.delete(disposal);
        };
        disposal.then(settled, settled);
        return disposal;
    };

    const disposeInBackground = (workspace: IWorkspace): void => {
        disposeOrThrow(workspace).catch(onError);
    };

    /** Removes `entry` from its run, dropping the run when it holds nothing more. */
    const forget = (runId: string, entry: Entry): void => {
        const entries = runs.get(runId);
        if (!entries || entries.get(entry.key) !== entry) return;
        entries.delete(entry.key);
        if (entries.size === 0) runs.delete(runId);
    };

    /** Forgets every expired or gone workspace of the run; returns them for disposal. */
    const sweep = (runId: string): IWorkspace[] => {
        const now = clock.now();
        const expired: IWorkspace[] = [];
        for (const entry of runs.get(runId)?.values() ?? []) {
            if (entry.workspace && (entry.workspace.disposed || isExpired(entry.workspace, now))) {
                forget(runId, entry);
                expired.push(entry.workspace);
            }
        }
        return expired;
    };

    const heldEntries = (runId: string): Entry[] => [...runs.get(runId)?.values() ?? []]
        .filter((entry) => entry.workspace !== undefined);

    const collectGarbage = async (): Promise<number> => {
        lastGcAt = clock.now().getTime();
        const expired = runs.keys().toArray().flatMap((runId) => sweep(runId));
        // a workspace found gone may still leave a stopped container behind,
        // but only the expired live ones count as collected here
        const counted = expired.filter((workspace) => !workspace.disposed).length;
        // own disposals first: the provider's collection would find the same
        // expired workspaces, count them twice and dispose them concurrently
        const disposed = await Promise.allSettled(expired.map((workspace) => disposeOrThrow(workspace)));
        for (const result of disposed) {
            if (result.status === 'rejected') onError(result.reason);
        }
        return counted + await provider.collectGarbage();
    };

    const maybeCollectGarbage = (): void => {
        if (gcIntervalMs === 0) return;
        const now = clock.now().getTime();
        if (lastGcAt !== undefined && now - lastGcAt < gcIntervalMs) return;
        collectGarbage().catch(onError);
    };

    const create = (runId: string, entries: Map<string, Entry>, entry: Entry, input: AcquireInput): Promise<IWorkspace> => {
        const createOptions: WorkspaceCreateOptions = { runId };
        if (entry.key !== '') createOptions.repo = entry.key;
        if (entry.ref !== undefined) createOptions.ref = entry.ref;
        if (options.image !== undefined) createOptions.image = options.image;
        if (options.env !== undefined) createOptions.env = options.env;
        if (options.limits !== undefined) createOptions.limits = options.limits;
        entry.abort = new AbortController();
        createOptions.signal = input.signal === undefined ?
            entry.abort.signal :
            AbortSignal.any([input.signal, entry.abort.signal]);

        return (async () => {
            let workspace: IWorkspace;
            try {
                workspace = await provider.create(createOptions);
            } catch (error) {
                delete entry.pending;
                delete entry.abort;
                forget(runId, entry);
                throw toSandboxError(error, 'workspace create failed');
            }
            delete entry.pending;
            delete entry.abort;
            if (runs.get(runId) !== entries || entries.get(entry.key) !== entry) {
                // released (run settled, dispose_workspace, close) while the provider created it
                await disposeOrThrow(workspace).catch(onError);
                throw new SandboxError('workspace released while it was created; call create_workspace again.');
            }
            entry.workspace = workspace;
            return workspace;
        })();
    };

    const acquire = async (runId: string, input: AcquireInput): Promise<AcquireResult> => {
        if (closed) throw new SandboxError('the workspace manager is closed.');
        const repo = input.repo === undefined ?
            undefined :
            normalizeRepo(input.repo, { allowFileRepos: options.allowFileRepos, allowRepo: options.allowRepo });
        const { ref } = input;
        if (ref !== undefined) {
            if (repo === undefined) throw new ValidationError('ref needs a repo.');
            assertGitRef(ref);
        }
        const key = repo ?? '';

        maybeCollectGarbage();
        for (const workspace of sweep(runId)) disposeInBackground(workspace);

        let entries = runs.get(runId);
        const existing = entries?.get(key);
        if (existing) {
            if (existing.ref !== ref) {
                throw new SandboxError(`This run already has a workspace of ${repo ?? 'no repository'} at ${existing.ref ?? 'the default branch'}; ` +
                    `dispose it first (dispose_workspace) to check out ${ref ?? 'the default branch'}.`);
            }
            const workspace = existing.workspace ?? await existing.pending!;
            return { workspace, reused: true };
        }

        if (entries && entries.size >= maxPerRun) {
            throw new SandboxError(`A run holds at most ${maxPerRun} workspaces; dispose one first (dispose_workspace).`);
        }
        if (!entries) {
            entries = new Map();
            runs.set(runId, entries);
        }
        const entry: Entry = { key, ref };
        entries.set(key, entry);
        entry.pending = create(runId, entries, entry, input);
        return { workspace: await entry.pending, reused: false };
    };

    /** Why `workspace` can no longer be used: gone (disposed outside the manager, container stopped) or expired. */
    const deadError = (workspace: IWorkspace): SandboxError => new SandboxError(workspace.disposed ?
        `workspace ${workspace.id} is gone (disposed, or its container, pod or directory stopped or was removed); call create_workspace for a new one.` :
        `workspace ${workspace.id} expired at ${workspace.info.expiresAt.toISOString()} and was disposed; call create_workspace for a new one.`);

    const get = (runId: string, workspaceId?: string): IWorkspace => {
        let entry: Entry | undefined;
        if (workspaceId === undefined) {
            // only live workspaces count when picking the run's one workspace
            const expired = sweep(runId);
            // the reason before the disposal: a disposed workspace reads as gone
            const dead = expired.length > 0 ? deadError(expired[0]!) : undefined;
            for (const workspace of expired) disposeInBackground(workspace);
            const held = heldEntries(runId);
            if (held.length === 0) {
                if (dead) throw dead;
                throw new SandboxError('This run has no workspace; call create_workspace first.');
            }
            if (held.length > 1) {
                const ids = held.map((e) => e.workspace!.id).join(', ');
                throw new ValidationError(`This run has ${held.length} workspaces (${ids}); pass workspace to pick one.`);
            }
            [entry] = held;
        } else {
            entry = heldEntries(runId).find((e) => e.workspace!.id === workspaceId);
            if (!entry) throw new SandboxError(NOT_FOUND);
        }

        const workspace = entry!.workspace!;
        if (workspace.disposed || isExpired(workspace, clock.now())) {
            const dead = deadError(workspace);
            forget(runId, entry!);
            disposeInBackground(workspace);
            throw dead;
        }
        return workspace;
    };

    const release = async (runId: string, workspaceId?: string): Promise<void> => {
        if (workspaceId !== undefined) {
            const entry = heldEntries(runId).find((e) => e.workspace!.id === workspaceId);
            if (!entry) throw new SandboxError(NOT_FOUND);
            forget(runId, entry);
            await disposeOrThrow(entry.workspace!);
            return;
        }

        const entries = runs.get(runId);
        if (!entries) return;
        runs.delete(runId);
        // pending creates are aborted, see their run gone and dispose what they
        // get; waiting for them keeps a container from outliving the release
        const pending = entries.values().toArray().flatMap((entry) => {
            if (!entry.pending) return [];
            entry.abort?.abort();
            return [entry.pending];
        });
        const held = entries.values().toArray().flatMap((entry) => (entry.workspace ? [entry.workspace] : []));
        const results = await Promise.allSettled(held.map((workspace) => disposeOrThrow(workspace)));
        // their rejections belong to their acquire callers
        await Promise.allSettled(pending);
        const failed = results.find((result) => result.status === 'rejected');
        if (failed) throw failed.reason;
    };

    const attach = (engine: Parameters<IWorkspaceManager['attach']>[0]): () => void => {
        // a closed manager holds nothing and acquires nothing: nothing to dispose
        if (closed) return () => {};
        const off = engine.on('run.updated', ({ run }) => {
            if (isTerminal(run.status)) release(run.id).catch(onError);
        });
        let active = true;
        const unsubscribe = () => {
            if (!active) return;
            active = false;
            subscriptions.delete(unsubscribe);
            off();
        };
        subscriptions.add(unsubscribe);
        return unsubscribe;
    };

    const manager: IWorkspaceManager = {
        acquire,
        get,
        release,
        attach,
        tools: () => {
            tools ??= createWorkspaceTools(manager);
            return tools;
        },
        collectGarbage,
        async close(closeOptions: CloseOptions = {}) {
            const timeoutMs = closeOptions?.timeoutMs ?? CLOSE_TIMEOUT_MS;
            if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0) {
                throw new InvalidAgentDefinitionError(`close() timeoutMs must be an integer of at least 0, got ${JSON.stringify(timeoutMs)}.`);
            }
            closed = true;
            for (const unsubscribe of [...subscriptions]) unsubscribe();

            // what is still being disposed or created, for the timeout report
            const left = new Set<string>();
            // disposals started before (a settled run, an expired or gone
            // workspace): their runs are no longer held, but their containers
            // must not outlive the close
            const started = disposals.entries().toArray().map(([disposal, id]) => {
                left.add(id);
                return disposal.catch(() => undefined).finally(() => left.delete(id));
            });
            const work = runs.entries().toArray().map(([runId, entries]) => {
                const labels = entries.values().toArray()
                    .map((entry) => entry.workspace?.id ?? `a workspace of run ${runId} still being created`);
                for (const label of labels) left.add(label);
                return release(runId).catch(onError).finally(() => {
                    for (const label of labels) left.delete(label);
                });
            });

            let timer: { clear(): void } | undefined;
            const timedOut = await Promise.race([
                Promise.all([...started, ...work]).then(() => false),
                new Promise<boolean>((resolve) => {
                    timer = clock.setTimeout(() => resolve(true), timeoutMs);
                }),
            ]);
            timer?.clear();
            if (timedOut && left.size > 0) {
                onError(new SandboxError(`workspace manager close() gave up after ${timeoutMs} ms; still disposing: ${[...left].join(', ')}`));
            }
        },
    };
    return manager;
}
