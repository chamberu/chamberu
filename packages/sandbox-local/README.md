<p align="center">
    <img src="https://raw.githubusercontent.com/chamberu/chamberu/master/.github/assets/logo.svg" alt="@chamberu/sandbox-local" width="128" height="128" />
</p>

<h1 align="center">@chamberu/sandbox-local</h1>

<p align="center">
    <b>Workspaces in a temporary directory, for development and tests.</b><br>
    Commands are spawned on the host as your user: no container, no isolation.<br>
    Use <code>@chamberu/sandbox-docker</code> or <code>@chamberu/sandbox-k8s</code> for anything a model may steer.
</p>

<p align="center">
    <a href="https://www.npmjs.com/package/@chamberu/sandbox-local"><img src="https://img.shields.io/npm/v/@chamberu/sandbox-local" alt="npm version" /></a>
    <a href="https://github.com/chamberu/chamberu/actions/workflows/ci.yml"><img src="https://github.com/chamberu/chamberu/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="https://github.com/chamberu/chamberu/blob/master/packages/sandbox-local/LICENSE"><img src="https://img.shields.io/npm/l/@chamberu/sandbox-local" alt="License" /></a>
</p>

---

**Table of Contents**
- [Installation](#installation)
- [Usage](#usage)
- [What it does and does not do](#what-it-does-and-does-not-do)
- [Options](#options)
- [API](#api)
- [License](#license)

## Installation

```bash
npm install @chamberu/sandbox-local @chamberu/sandbox @chamberu/core ai --save
```

ESM only, Node.js `>=22`, a POSIX host (Linux or macOS) with `git` on the `PATH`. `@chamberu/core` and `@chamberu/sandbox` are peer dependencies; there are no other runtime dependencies.

## Usage

```typescript
import { createWorkspaceManager } from '@chamberu/sandbox';
import type { IWorkspaceManager } from '@chamberu/sandbox';
import { createLocalSandbox } from '@chamberu/sandbox-local';

// no isolation: commands run as your user, for development and tests only
export function createDevWorkspaces(root?: string): IWorkspaceManager {
    return createWorkspaceManager({ provider: createLocalSandbox({ root }) });
}
```

Each workspace is a folder `<root>/<id>/` (`root` defaults to `<os tmpdir>/chamberu-workspaces`) with `repo/` (the model's `/workspace`), `home/`, `tmp/` and a `workspace.json` record (run id and expiry) the garbage collection reads. `dispose()` removes the folder.

## What it does and does not do

**No isolation.** A command runs as the host user with the host's filesystem, network and processes in reach. `/workspace` paths in tool input are confined to the folder, symbolic links included (a path whose real path leaves the folder, say through a link the repository brings, is a `ValidationError`; checked before each call, so a command running at the same time can still swap a link in), but `bash` can `cd /` and read your SSH keys. Use it on your machine with models and repositories you trust, and in tests.

What it does enforce:

- **Environment**: only the host `PATH`, `HOME` and `TMPDIR` inside the workspace folder, `GIT_TERMINAL_PROMPT=0`, `GIT_CONFIG_NOSYSTEM=1` (a system gitconfig may name a credential helper such as macOS `osxkeychain`), `NPM_CONFIG_UPDATE_NOTIFIER=false`, `CI=true` and the configured `env`. No other host variable (tokens, cloud credentials) reaches a command.
- **Timeouts and abort**: every command starts its own process group (`detached`); a timeout, an abort or a dispose kills the whole group with `SIGKILL`, backgrounded grandchildren included. The kill timer is cleared when the child exits, so it never signals a reused pid. A command that exits while a background job it started still holds its output (`node server.js & echo started`) returns 2 s (`KILL_GRACE_MS`) after its exit with its own exit code and `timedOut: false`; the job keeps running until the workspace is disposed, as on Docker and Kubernetes, also with its output redirected (`nohup node server.js > log 2>&1 &`). The workspace remembers the process group of such a command and forgets it once the group ended (checked every second, `LINGER_CHECK_MS`; a group id is only reused after every member is gone), so the dispose kills the jobs but not a group that took the id over later. The one window left is a group that ends and whose id another process group takes within that second.
- **Output caps**: 64 KiB per stream, drained past the cap.
- **Lifetime**: `limits.timeoutMs` (default 30 minutes) is the expiry; `collectGarbage()` deletes expired workspace folders under `root` (also those of crashed processes), disposing open ones first. Folders that are no workspace are left alone. A folder that cannot be deleted does not stop the pass: the others go, and one `SandboxError` with the count and the first failure is thrown at the end.

`cpu`, `memory`, `storage` and `pids` are not enforced, so `limits` takes `timeoutMs` only.

## Options

`createLocalSandbox(options?)`:

| Option | Type | Default | Description |
|---|---|---|---|
| `root` | `string` | `<os tmpdir>/chamberu-workspaces` | Directory holding one folder per workspace |
| `env` | `Record<string, string>` | none | Added to every workspace's environment (wins over the defaults) |
| `limits` | `{ timeoutMs? }` | `1_800_000` | The workspace lifetime |
| `clock` | `IClock` | `systemClock` | Expiry and timeouts |

## API

| Export | Kind | Purpose |
|---|---|---|
| `createLocalSandbox` | function | The `ISandboxProvider` (`name: 'local'`) |

Types: `LocalSandboxOptions`.

## License

Published under [Apache License 2.0](./LICENSE).
