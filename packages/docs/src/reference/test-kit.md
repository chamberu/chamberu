# @chamberu/test-kit

Test helpers for chamberu: a controllable clock, the store contract suite and the workspace contract suite.

```bash
npm install --save-dev @chamberu/test-kit @chamberu/core vitest
```

`@chamberu/core` and `vitest` are peer dependencies; `@chamberu/sandbox` is an optional peer for the workspace contract.

## describeStoreContract

```ts
function describeStoreContract(
    create: (clock: ControllableClock) => IStore | Promise<IStore>,
): void;
```

Registers the Vitest suite every `IStore` implementation must pass. `create` is called once per test with a fresh `ControllableClock` and must return a fresh, empty store that uses that clock for every expiry decision.

<<< @/snippets/store-contract.ts#contract

See [Writing a Store](/stores/writing-a-store) for what the suite covers.

## describeWorkspaceContract

```ts
function describeWorkspaceContract(name: string, factory: WorkspaceContractFactory): void;

type WorkspaceContractFactory = () => Promise<IWorkspace>;
```

Registers the Vitest suite every sandbox provider's workspaces must pass: argv exec and exit codes (127 for a command that cannot start), stdin, `cwd` and path escapes (`../..`, `/etc`, an empty path, a NUL byte), the 64 KiB output caps under a flood, a process-group kill on timeout that takes a backgrounded grandchild with it, abort, UTF-8 files and their size cap, and dispose during an exec. `factory` returns a fresh, repo-less workspace per test; the suite disposes it. It runs real processes with short real timeouts, not a `ControllableClock`.

```ts
describeWorkspaceContract('local', () => createLocalSandbox({ root }).create({ runId: 'r1' }));
```

## createGitFixture

```ts
function createGitFixture(files: Record<string, string>): Promise<GitFixture>;
```

<<< ../../../test-kit/src/git-fixture/types.ts{ts}

A temporary repository with one commit of `files` on branch `main`, tagged `v1`, ignoring the machine's git config. Pass `url` to a workspace manager with `allowFileRepos: true`.

## ControllableClock

```ts
class ControllableClock implements IClock {
    constructor(start?: Date); // default new Date(0)
    now(): Date;
    setTimeout(fn: () => void, ms: number): { clear(): void };
    advance(ms: number): void;
}
```

Time moves only through `advance(ms)`, which fires every timer due within the window in order, including timers scheduled by fired callbacks. The `keepAlive` timer option has no meaning without a real event loop and is ignored.

<<< @/snippets/testing.ts#clock

Pass the same clock to the store and to the engine (`new Engine({ ..., clock })`) to test claim leases, run timeouts and approval expiry without real timers.
