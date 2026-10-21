import { createWorkspaceManager } from '@chamvi/sandbox';
import type { IWorkspaceManager } from '@chamvi/sandbox';
import { createLocalSandbox } from '@chamvi/sandbox-local';

// no isolation: commands run as your user, for development and tests only
export function createDevWorkspaces(root?: string): IWorkspaceManager {
    return createWorkspaceManager({ provider: createLocalSandbox({ root }) });
}
