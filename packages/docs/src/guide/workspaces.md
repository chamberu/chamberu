# Workspaces & Coding

An agent that reproduces a bug, runs tests or fixes code needs a place to run commands. chamberu gives each run **disposable workspaces**: a directory, optionally a shallow checkout of a git repository, in which the model runs commands and edits files through tools. Workspaces come from a **sandbox provider** and are held by a **workspace manager** that disposes them when the run settles.

```bash
npm install @chamberu/sandbox @chamberu/coding @chamberu/sandbox-docker
```

## Providers

| Provider | Package | A workspace is | Isolation |
|---|---|---|---|
| local | [`@chamberu/sandbox-local`](/reference/sandbox#chamberu-sandbox-local) | a temporary directory on the host | **none**: development and tests only |
| Docker | [`@chamberu/sandbox-docker`](/reference/sandbox#chamberu-sandbox-docker) | one container | uid 1000, read-only root, no capabilities, `no-new-privileges`, cpu, memory and pid limits |
| Kubernetes | [`@chamberu/sandbox-k8s`](/reference/sandbox#chamberu-sandbox-k8s) | one pod | non-root, read-only root, no capabilities, no service account token, resource limits, `activeDeadlineSeconds` |

All three pass the same workspace contract (`describeWorkspaceContract` from `@chamberu/test-kit`): argv-only exec, path checks, output caps, process-group kills on timeout, and dispose semantics.

<<< @/snippets/sandbox-providers.ts#docker

<<< @/snippets/sandbox-providers.ts#k8s

The container providers use `ghcr.io/chamberu/sandbox-node:24` by default (Node.js 24, npm, git, `tini`, GNU coreutils), built for `linux/amd64` and `linux/arm64`. Pin a digest in production. See [Docker Image](/deployment/docker#sandbox-image).

## The manager and its tools

<<< @/snippets/workspaces.ts#setup

`workspaces.tools()` gives the model two tools; `codingTools(workspaces)` adds seven more. Every tool resolves its workspace with the calling run's id, so a run can only reach its own workspaces.

| Tool | Package | What it does |
|---|---|---|
| `create_workspace` | sandbox | `{ repo?, ref? }`: a shallow checkout of `repo` at `ref`, or an empty git repository; the same repository again returns the same workspace (`reused: true`) |
| `dispose_workspace` | sandbox | `{ workspace? }`: disposes one workspace |
| `read_file` | coding | A line range of a text file (at most 2000 lines, 65 536 characters) |
| `write_file` | coding | Replaces a file, creating directories |
| `edit_file` | coding | Replaces an exact string, once (or every match with `replaceAll`) |
| `grep` | coding | `git grep -E` over tracked and untracked files |
| `list_files` | coding | Tracked and untracked files, git-ignored ones skipped |
| `bash` | coding | `sh -c <command>` inside the workspace, exit code and capped output |
| `git_diff` | coding | `git status --short` and the unified diff |

The coding tools take an optional `workspace` id; omitted, they use the run's only workspace. The model sees every workspace at `/workspace`, whatever the provider maps it to. See the [`@chamberu/coding` reference](/reference/coding) for inputs and results.

A run may hold `maxWorkspacesPerRun` (3) workspaces at once. Repositories are `owner/name` (GitHub) or an `https:` URL without credentials, query or fragment; `allowRepo` narrows them, `allowFileRepos` adds `file:///absolute/path` for development. Refs are plain branch, tag or commit names that git can never read as an option or a range.

## Lifecycle

A workspace is keyed by run and repository. It lives until the first of:

- the run settles: `completed`, `failed` or `cancelled` (through `workspaces.attach(engine)`). A run `waiting` for an approval or `interrupted` on this replica keeps its workspaces.
- `dispose_workspace`, or `workspaces.release(runId, id?)`
- its expiry, `limits.timeoutMs` (default 30 minutes), checked on every use
- it was found gone: its container stopped or was removed, its pod failed, was evicted or deleted, or its local directory was removed. The call that found it says "workspace ... is gone; call create_workspace for a new one", and `create_workspace` then creates a new one
- `workspaces.close()`: call it **after** `engine.drain()` at shutdown. It aborts the creates still in flight and waits for them and for every disposal, at most 30 seconds (`close({ timeoutMs })`), then reports what is left to `onError`
- garbage collection: `acquire` runs `workspaces.collectGarbage()` at most every 10 minutes, which also asks the provider to remove expired containers, pods or directories left behind by crashed processes

A workspace lives in one process. A run that resumes on another replica, or after a restart, finds none and is told to call `create_workspace` again; the model redoes the checkout. Re-attaching to a surviving container or pod by label is planned.

For development, the local provider runs everything in a temporary directory:

<<< @/snippets/workspaces.ts#local

## Commands, output and timeouts

- `exec` takes **argv only**; the only shell is the `bash` tool's `sh -c` inside the workspace.
- stdout and stderr are capped at 64 KiB each (`stdoutTruncated`, `stderrTruncated`); output past the cap is drained, never buffered, so `yes` cannot block the child or fill the host's memory.
- A command times out after `timeoutMs` (default 5 minutes, at most 30, never past the workspace's expiry) with `timedOut: true` as a result, not an error. The whole process group is killed, background jobs included: local sends `SIGKILL` to the group, Docker and Kubernetes run every command inside GNU `timeout -k 5`. A command that exits on its own returns with its exit code even when a background job it started (`node server.js & echo started`) holds its output (after about 2 seconds); the job runs on until the workspace is disposed, so the next call can probe the server.
- **Abort** (a cancelled run, a run timeout): local kills the process group. Docker and Kubernetes **detach**: the client stops waiting, and the command runs on until its `timeout` fires or the workspace is disposed, which the settled run's `attach` does right after.
- A sandbox failure (a failed create or checkout, an unknown or expired workspace, a daemon or API error) is a `SandboxError`: a tool error the model sees, never a failed run.

## Why the coding tools are not effect tools

`write_file`, `edit_file`, `bash`, `create_workspace` and `dispose_workspace` change state, yet they are plain [`defineTool()`](/guide/tools) tools, not [effect tools](/guide/effect-tools). An effect record lives in the store and survives a crash; a workspace lives in one process and does not. After a crash the redone step would run on a fresh workspace, where a recorded "applied" result would skip the write and leave the workspace and the history out of step. Effect tools would also merge two identical calls of one step (`npm test` twice) into one.

Re-applying is safe instead: `write_file` is idempotent, `edit_file` fails with "oldString not found" when it already applied (the model sees that), and `bash` runs in a disposable sandbox. Nothing outside the workspace changes; pushing is not part of these tools.

## Security model

- **The model runs untrusted code.** Whatever it reads (an issue body, a README, a test's output) can steer what it runs: prompt injection. Run untrusted repositories on Docker or Kubernetes, never local, narrow `allowRepo`, and put `bash` behind an [approval](/guide/approvals) (`approvals: { bash: 'user' }`) where a human should see each command.
- **Local isolates nothing.** Commands run as the host user with your files and network in reach. It only keeps the host environment out (just `PATH`, its own `HOME` and `TMPDIR`) and kills process groups.
- **Docker and Kubernetes enforce** a non-root user, a read-only root filesystem, no capabilities, no privilege escalation, cpu and memory limits (pids on Docker, the kubelet's `podPidsLimit` on Kubernetes; storage on Kubernetes), a lifetime, and no host or chamberu environment. Kubernetes mounts no service account token.
- **No credentials enter a workspace.** URLs with credentials are refused (and never echoed in an error), git's credential helpers are reset for the fetch, and only `SANDBOX_ENV` plus your configured `env` reach a command. Private repositories are not supported yet.
- **A sandbox is a code-execution boundary, not a network boundary.** On a Docker bridge a workspace reaches the host gateway (the chamberu API, Postgres, an MCP server), other containers and cloud metadata (`169.254.169.254`); on Kubernetes every service in the cluster. Until the Helm chart's NetworkPolicy ships, add one yourself (select `app.kubernetes.io/component=sandbox`, allow only GitHub and the npm registry, deny the chamberu namespace and the metadata address), or on Docker a network with `enable_icc=false` plus host firewall rules.
- **Docker socket access is root on the host.** Give chamberu a socket proxy or rootless Docker rather than the raw socket.
