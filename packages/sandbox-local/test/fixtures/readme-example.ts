import { createWorkspaceManager } from '@chamberu/sandbox';
import type { IWorkspaceManager } from '@chamberu/sandbox';
import { createLocalSandbox } from '@chamberu/sandbox-local';

// no isolation: commands run as your user, for development and tests only
export function createDevWorkspaces(root?: string): IWorkspaceManager {
    return createWorkspaceManager({ provider: createLocalSandbox({ root }) });
}
