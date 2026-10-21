# Errors

Every error chamberu throws extends `ChamberuError`, which extends ebec's `BaseError`. Each carries a `code`; the codes are exported as `ErrorCode`.

| Class | `ErrorCode` | Code | Thrown when |
|---|---|---|---|
| `InvalidAgentDefinitionError` | `INVALID_AGENT_DEFINITION` | `invalid_agent_definition` | An agent name, trigger id or cron expression is invalid; duplicate agent names; an unknown notifier; an empty `resumeSecret`; `dispatch()` for an unknown agent |
| `InvalidResumeTokenError` | `INVALID_RESUME_TOKEN` | `invalid_resume_token` | A resume token is malformed, forged, expired or belongs to another wait point |
| `InvalidRunStateError` | `INVALID_RUN_STATE` | `invalid_run_state` | A run is not in the status an operation needs: resuming a run that is not waiting, cancelling a settled run, a store guard (`expectStatus`, `expectOwner`) that does not match |
| `RunNotFoundError` | `RUN_NOT_FOUND` | `run_not_found` | `resume()`, `cancel()` or `updateRun()` for an unknown run |
| `ArtifactNotFoundError` | `ARTIFACT_NOT_FOUND` | `artifact_not_found` | An execution cannot read an artifact its messages refer to (the run fails); `@chamberu/http` answers 404 with it for an unknown artifact |
| `BudgetExceededError` | `BUDGET_EXCEEDED` | `BudgetExceeded` | A run hit `maxSteps` or `maxTokens` while the model still wanted tools |
| `TimeoutError` | `TIMEOUT` | `Timeout` | An execution exceeded `timeoutMs` |
| `FatalToolError` | `FATAL_TOOL` | `FatalToolError` (or a custom code) | A tool decides the run must fail |
| `IncompleteResponseError` | `INCOMPLETE_RESPONSE` | `incomplete_response` | The model gave no complete answer and the run fails: its stream ended without a finish part, or (with [structured `output`](/guide/agents#structured-output)) the answer was cut off at the output token limit or the loop ended on a tool call nothing executed |
| `ToolNotAllowedError` | `TOOL_NOT_ALLOWED` | `tool_not_allowed` | A call to a tool the agent's `toolPolicy` refuses: recorded on the tool step for a model's call to it, and returned to the model for an approved call from an older history; a tool error, the run goes on |
| `LeaseLostError` | `LEASE_LOST` | `lease_lost` | Reported to `onError` when an engine stops executing a run whose claim it lost; carries `runId` |
| `SandboxError` | `SANDBOX` | `sandbox_error` | A [workspace](/guide/workspaces) or its provider failed: a create, start or checkout (with git's stderr), a missing or oversized file, an unknown, expired or disposed workspace, a Docker or Kubernetes API error, a reached per-run workspace cap; a tool error, the run goes on |
| `ValidationError` | `VALIDATION` | `validation_error` | A state document fails its schema (carries `issues`); an invalid attachment at `dispatch()` or `artifacts.put()`; a final answer that does not parse as the agent's [structured `output`](/guide/agents#structured-output) (the run fails); a workspace path, repository or ref the sandbox rules refuse (a tool error) |

## Run errors

A failed run stores `{ code, message }` in `run.error`. For budget, timeout and fatal tool failures the code is the error's code. Any other thrown value gets its own `code` if it has a string one, else `Error`.

<<< @/snippets/errors.ts#run-error

## Errors without a caller

Some errors happen where nobody awaits: a lost lease, a failed notification, a listener that throws, a failed recovery pass. They go to `onError(error, run?)`, by default `console.error`. Pass your logger. A `LeaseLostError` there is informational: another replica carries the run on.

<<< @/snippets/errors.ts#on-error
