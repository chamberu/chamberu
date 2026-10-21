<p align="center">
    <img src="https://raw.githubusercontent.com/chamberu/chamberu/master/.github/assets/logo.svg" alt="@chamberu/coding" width="128" height="128" />
</p>

<h1 align="center">@chamberu/coding</h1>

<p align="center">
    <b>Coding tools for chamberu agents.</b><br>
    Read, write and edit files, search, run shell commands and show the diff,<br>
    in a disposable workspace of the calling run on any sandbox provider.
</p>

<p align="center">
    <a href="https://www.npmjs.com/package/@chamberu/coding"><img src="https://img.shields.io/npm/v/@chamberu/coding" alt="npm version" /></a>
    <a href="https://github.com/chamberu/chamberu/actions/workflows/ci.yml"><img src="https://github.com/chamberu/chamberu/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="https://github.com/chamberu/chamberu/blob/master/packages/coding/LICENSE"><img src="https://img.shields.io/npm/l/@chamberu/coding" alt="License" /></a>
</p>

---

**Table of Contents**
- [Installation](#installation)
- [Usage](#usage)
- [Tools](#tools)
- [Workspaces](#workspaces)
- [Not effect tools](#not-effect-tools)
- [Security](#security)
- [Coding backends](#coding-backends)
- [API](#api)
- [License](#license)

## Installation

```bash
npm install @chamberu/coding @chamberu/sandbox @chamberu/core ai --save
```

ESM only, Node.js `>=22`. `@chamberu/core`, `@chamberu/sandbox` and `ai` are peer dependencies. Add a sandbox provider: `@chamberu/sandbox-docker` or `@chamberu/sandbox-k8s` (or `@chamberu/sandbox-local` for development).

## Usage

```typescript
import type { LanguageModel } from 'ai';
import { codingTools } from '@chamberu/coding';
import { defineAgent, http } from '@chamberu/core';
import type { IWorkspaceManager } from '@chamberu/sandbox';

export function createCodingAgent(model: LanguageModel, workspaces: IWorkspaceManager) {
    return defineAgent({
        name: 'triage',
        model,
        instructions: 'Check out the repository named in the payload, reproduce the reported bug ' +
            'with a failing test and answer with what you found and the diff.',
        triggers: [http()],
        // create_workspace and dispose_workspace, then the seven coding tools
        tools: { ...workspaces.tools(), ...codingTools(workspaces) },
        // every shell command waits for a human
        approvals: { bash: 'user' },
        budget: { maxSteps: 40 },
    });
}
```

`workspaces` is a manager from `createWorkspaceManager({ provider })` (`@chamberu/sandbox`), attached to the engine with `workspaces.attach(engine)` so a run's workspaces go when it settles. The model calls `create_workspace` first, then works in it.

## Tools

`codingTools(workspaces)` returns a plain AI SDK `ToolSet`. Paths are relative to the workspace root or start with `/workspace/`; anything that leaves the root is a tool error.

| Tool | Input | Result |
|---|---|---|
| `read_file` | `{ path, offset?, limit?, workspace? }` | `{ path, content, startLine, endLine, totalLines, truncated }`: at most 2000 lines and 65 536 characters |
| `write_file` | `{ path, content, workspace? }` | `{ path, bytes }`: replaces the file, creates missing directories |
| `edit_file` | `{ path, oldString, newString, replaceAll?, workspace? }` | `{ path, replacements }`: `oldString` must match exactly once unless `replaceAll`. Calls of `edit_file` and `write_file` on one file run one after the other, so several edits of a file in one step all apply |
| `grep` | `{ pattern, path?, ignoreCase?, limit?, workspace? }` | `{ matches: [{ path, line, text }], truncated }`: `git grep -E` over tracked and untracked files, git-ignored ones skipped; default 100, at most 500 matches, lines cut at 500 characters |
| `list_files` | `{ path?, limit?, workspace? }` | `{ files, truncated }`: tracked and untracked, not ignored, sorted; default 1000, at most 5000 |
| `bash` | `{ command, cwd?, timeoutMs?, workspace? }` | `{ exitCode, stdout, stderr, stdoutTruncated, stderrTruncated, timedOut, durationMs }`: `sh -c` inside the workspace, 64 KiB per stream, default timeout 5 minutes, at most 30 |
| `git_diff` | `{ staged?, path?, workspace? }` | `{ status, diff, truncated }`: `git status --short` and the unified diff (of the index with `staged`) |

`grep`, `list_files` and `git_diff` run git with `--literal-pathspecs`, so a path like `:!src` names a file and is never pathspec magic. A model mistake (an unknown file, an `oldString` that is missing or ambiguous, a bad path) comes back as a tool error it can correct; a broken sandbox is a `SandboxError` tool error, never a failed run.

## Workspaces

Every tool takes an optional `workspace` id (from `create_workspace`). Omitted, the tool uses the run's only workspace; with several, the model must name one. Workspaces are resolved through the manager with `context.run.runId`, so a run can never reach another run's workspace: an id of another run is "not found".

## Not effect tools

`write_file`, `edit_file` and `bash` change state but are deliberately not effect tools. A workspace lives in one process and dies with it, while an effect record survives in the store: after a crash the redone step runs on a fresh workspace, where a recorded "applied" result would skip the write. Re-applying is safe instead: `write_file` is idempotent, `edit_file` fails with "oldString not found" when it already applied, and `bash` runs in a disposable sandbox. Nothing outside the workspace changes (no push).

## Security

`bash` runs whatever the model writes, and the model follows what it reads (an issue, a README, a test output): treat it as untrusted code. Use the Docker or Kubernetes provider, keep the workspace network firewalled, narrow `allowRepo` on the manager, and put `bash` behind an approval (`approvals: { bash: 'user' }`) where a human should see each command.

## Coding backends

`ICodingBackend` is the contract for something that solves a coding task in a workspace with its own tool loop (Claude Code, or these tools in a nested agent):

```ts
interface ICodingBackend {
    code(task: CodingTask): Promise<CodingResult>;
}
// CodingTask: { workspace, task, budget?: { maxSteps?, maxTokens?, timeoutMs? }, signal? }
// CodingResult: { status: 'done' | 'stuck', summary, diff }
```

The package ships the contract only; backends are planned.

## API

| Export | Kind | Purpose |
|---|---|---|
| `codingTools` | function | The seven coding tools over a workspace manager |
| `READ_MAX_LINES`, `READ_MAX_CHARS` | constant | `2_000`, `65_536` |
| `SEARCH_MAX_RESULTS`, `LIST_MAX_RESULTS` | constant | `500`, `5_000` |
| `LINE_MAX_CHARS` | constant | `500` |

Types: `CodingWorkspaces`, `ReadFileResult`, `WriteFileResult`, `EditFileResult`, `GrepMatch`, `GrepResult`, `ListFilesResult`, `GitDiffResult`, `ICodingBackend`, `CodingTask`, `CodingResult`, `CodingBudget`.

## License

Published under [Apache License 2.0](./LICENSE).
