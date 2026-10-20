# Sandboxes

The sandbox packages: `@chamberu/sandbox` (contracts, rules, the workspace manager) and the three providers. See [Workspaces & Coding](/guide/workspaces) for the behaviour.

## @chamberu/sandbox

```bash
npm install @chamberu/sandbox @chamberu/core ai --save
```

`@chamberu/core` and `ai` are peer dependencies.

### createWorkspaceManager

```ts
function createWorkspaceManager(options: WorkspaceManagerOptions): IWorkspaceManager;

const MAX_WORKSPACES_PER_RUN: 3;
const GC_INTERVAL_MS: 600_000;
const CLOSE_TIMEOUT_MS: 30_000;
```

Throws `InvalidAgentDefinitionError` for a provider without `create` and `collectGarbage`, an empty `image`, invalid `env` or `limits`, an `allowRepo` or `onError` that is no function, a `maxWorkspacesPerRun` below 1 or a negative `gcIntervalMs`.

<<< ../../../sandbox/src/manager/types.ts{ts}

### Workspaces and providers

<<< ../../../sandbox/src/workspace/types.ts{ts}

<<< ../../../sandbox/src/provider/types.ts{ts}

<<< ../../../sandbox/src/workspace/constants.ts{ts}

<<< ../../../sandbox/src/provider/constants.ts{ts}

### Rules

```ts
function normalizeRepo(input: string, options?: NormalizeRepoOptions): string;
function assertGitRef(ref: string): void;
function resolveWorkspacePath(path: string): string;
function resolveLimits(...layers: Array<SandboxLimits | undefined>): Required<SandboxLimits>;
function parseCpu(value: string): number;
function parseMemory(value: string): number;
function assertSandboxEnv(env: Record<string, string> | undefined): void;
function prepareWorkspace(workspace: IWorkspace, input: { repo?: string; ref?: string; signal?: AbortSignal }): Promise<{ commit?: string }>;
function createOutputCollector(maxBytes: number): IOutputCollector;
```

`normalizeRepo`, `assertGitRef` and `resolveWorkspacePath` throw `ValidationError` (model input); `resolveLimits`, `parseCpu`, `parseMemory` and `assertSandboxEnv` throw `InvalidAgentDefinitionError` (configuration); `prepareWorkspace` throws `SandboxError` with git's stderr when a checkout step fails.

### Remote workspaces

```ts
function createRemoteWorkspace(input: RemoteWorkspaceInput): IWorkspace;

const TIMEOUT_KILL_AFTER_SECONDS: 5;
const EXEC_GRACE_MS: 15_000;
const ALIVE_PROBE_TIMEOUT_MS: 5_000;
```

A provider that can run argv in a container implements `IExecTransport`: it runs argv, streams stdout and stderr into the sinks it is given and resolves the exit code. `createRemoteWorkspace` adds the rest: the `sh -c` script that enters the working directory, runs the command behind the timeout wrapper and reports its exit on stderr (so an exec returns about 2 s after the command exited, even when a background job holds its output), the guard, path checks, output caps, file reads and writes, dispose. After a failed exec it asks `alive()` (at most `ALIVE_PROBE_TIMEOUT_MS`); `false` marks the workspace gone (`disposed`).

<<< ../../../sandbox/src/remote/types.ts{ts}

## @chamberu/sandbox-local

```ts
function createLocalSandbox(options?: LocalSandboxOptions): ISandboxProvider; // name 'local'
```

No isolation: development and tests only. Workspaces are folders under `root` (default `<os tmpdir>/chamberu-workspaces`); of the limits only `timeoutMs` applies.

<<< ../../../sandbox-local/src/provider/types.ts{ts}

## @chamberu/sandbox-docker

```ts
function createDockerSandbox(options?: DockerSandboxOptions): ISandboxProvider; // name 'docker'

const DEFAULT_NETWORK: 'bridge';
const CONTAINER_NAME_PREFIX: 'chamberu-ws-';
const SANDBOX_USER: '1000:1000';
```

One container per workspace, removed with its volume on dispose. Creating the provider contacts nothing.

<<< ../../../sandbox-docker/src/provider/types.ts{ts}

## @chamberu/sandbox-k8s

```ts
function createKubernetesSandbox(options: KubernetesSandboxOptions): ISandboxProvider; // name 'k8s'
function createPodClient(input: CreatePodClientInput): IPodClient;

const CONTAINER_NAME: 'sandbox';
const POD_NAME_PREFIX: 'chamberu-ws-';
const START_TIMEOUT_MS: 120_000;
const POLL_MS: 1_000;
const FATAL_WAITING_REASONS: readonly string[];
```

One pod per workspace. The Role needs `pods` `create`, `get`, `list`, `delete` and `pods/exec` `get` and `create` in the sandbox namespace. See [Kubernetes & Flux](/deployment/kubernetes#sandboxes-in-the-cluster).

<<< ../../../sandbox-k8s/src/provider/types.ts{ts}

<<< ../../../sandbox-k8s/src/client/types.ts{ts}
