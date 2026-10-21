/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    ISandboxProvider,
    IWorkspaceManager,
    WorkspaceManagerOptions,
} from '@chamvi/sandbox';
import type { Env } from '../env/types.ts';

export type SandboxProviderName = 'local' | 'docker' | 'kubernetes';

/**
 * `createWorkspaceManager()` options; the manager's `env` is `workspaceEnv`
 * here, since `env` is the process env the factory reads.
 */
export type SandboxModuleOptions = Omit<WorkspaceManagerOptions, 'provider' | 'env'> & {
    /** A provider name (`CHAMVI_SANDBOX_PROVIDER` wins) or an instance; default `'local'`. */
    provider?: SandboxProviderName | ISandboxProvider;
    /** Used as is; no provider is built then. */
    manager?: IWorkspaceManager;
    /** Kubernetes namespace of the workspace pods; `CHAMVI_SANDBOX_NAMESPACE` wins. */
    namespace?: string;
    /** Docker and Kubernetes image; `CHAMVI_SANDBOX_IMAGE` wins, default `DEFAULT_SANDBOX_IMAGE`. */
    image?: string;
    /** Added to every workspace's environment. */
    workspaceEnv?: Record<string, string>;
    /** Default `process.env`, read when the factory is called. */
    env?: Env;
};
