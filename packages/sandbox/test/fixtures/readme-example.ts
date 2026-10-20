import type { RunEngine } from '@chamberu/core';
import { createWorkspaceManager } from '@chamberu/sandbox';
import type { ISandboxProvider, IWorkspaceManager } from '@chamberu/sandbox';

export function createWorkspaces(
    provider: ISandboxProvider,
    engine: Pick<RunEngine, 'on'>,
): IWorkspaceManager {
    const workspaces = createWorkspaceManager({
        provider,
        // at most two workspaces per run, each gone after 15 minutes
        maxWorkspacesPerRun: 2,
        limits: { timeoutMs: 15 * 60_000 },
        // only repositories of your own organisation
        allowRepo: (url) => url.startsWith('https://github.com/acme/'),
    });

    // dispose a run's workspaces once it completed, failed or was cancelled
    workspaces.attach(engine);
    return workspaces;
}
