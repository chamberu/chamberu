# @chamberu/coding

Coding tools for chamberu agents and the coding backend contract. The public API of `packages/coding/src/index.ts`.

```bash
npm install @chamberu/coding @chamberu/sandbox @chamberu/core ai --save
```

`@chamberu/core`, `@chamberu/sandbox` and `ai` are peer dependencies. See [Workspaces & Coding](/guide/workspaces) for the behaviour.

## codingTools

```ts
function codingTools(workspaces: CodingWorkspaces): ToolSet;

type CodingWorkspaces = Pick<IWorkspaceManager, 'get'>;
```

Throws `InvalidAgentDefinitionError` when `workspaces` has no `get`. Returns `read_file`, `write_file`, `edit_file`, `grep`, `list_files`, `bash` and `git_diff`, each a [`defineTool()`](/guide/tools) tool that resolves its workspace through `workspaces.get(context.run.runId, input.workspace)`.

| Tool | Input | Result |
|---|---|---|
| `read_file` | `path`, `offset?` (1-based, default 1), `limit?` (default and maximum 2000) | `ReadFileResult` |
| `write_file` | `path`, `content` | `WriteFileResult` |
| `edit_file` | `path`, `oldString`, `newString`, `replaceAll?` | `EditFileResult` |
| `grep` | `pattern` (POSIX ERE), `path?`, `ignoreCase?`, `limit?` (default 100, at most 500) | `GrepResult` |
| `list_files` | `path?`, `limit?` (default 1000, at most 5000) | `ListFilesResult` |
| `bash` | `command`, `cwd?`, `timeoutMs?` (default 300 000, at most 1 800 000) | `ExecResult` from `@chamberu/sandbox` |
| `git_diff` | `staged?`, `path?` | `GitDiffResult` |

Every tool also takes `workspace?`, the id from `create_workspace`. A path is relative to the workspace root or starts with `/workspace/`. Input the model can correct (a bad path, an `oldString` that is missing or ambiguous) is a `ValidationError` tool error; a missing or oversized file and any other sandbox failure a `SandboxError` tool error.

<<< ../../../coding/src/tools/types.ts{ts}

```ts
const READ_MAX_LINES: 2_000;
const READ_MAX_CHARS: 65_536;
const SEARCH_MAX_RESULTS: 500;
const LIST_MAX_RESULTS: 5_000;
const LINE_MAX_CHARS: 500;
```

## ICodingBackend

The contract for something that solves a coding task in a workspace with its own tool loop. Only the contract ships; backends (the own tools in a nested loop, Claude Code) are planned.

<<< ../../../coding/src/backend/types.ts{ts}
