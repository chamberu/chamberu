# Errors

Every error chamberu throws extends `ChamberuError`, which extends ebec's `BaseError`. Each carries a `code`; the codes are exported as `ErrorCode`.

| Class | `ErrorCode` | Code | Thrown when |
|---|---|---|---|
| `InvalidAgentDefinitionError` | `INVALID_AGENT_DEFINITION` | `invalid_agent_definition` | An agent name, trigger id or cron expression is invalid; duplicate agent names; an unknown notifier; an empty `resumeSecret`; `dispatch()` for an unknown agent |
| `InvalidResumeTokenError` | `INVALID_RESUME_TOKEN` | `invalid_resume_token` | A resume token is malformed, forged, expired or belongs to another wait point |
| `InvalidRunStateError` | `INVALID_RUN_STATE` | `invalid_run_state` | A run is not in the status an operation needs: resuming a run that is not waiting, cancelling a settled run, a store guard (`expectStatus`, `expectOwner`) that does not match |
| `RunNotFoundError` | `RUN_NOT_FOUND` | `run_not_found` | `resume()`, `cancel()` or `updateRun()` for an unknown run |
| `BudgetExceededError` | `BUDGET_EXCEEDED` | `BudgetExceeded` | A run hit `maxSteps` or `maxTokens` while the model still wanted tools |
| `TimeoutError` | `TIMEOUT` | `Timeout` | An execution exceeded `timeoutMs` |
| `FatalToolError` | `FATAL_TOOL` | `FatalToolError` (or a custom code) | A tool decides the run must fail |
| `LeaseLostError` | `LEASE_LOST` | `lease_lost` | Reported to `onError` when an engine stops executing a run whose claim it lost; carries `runId` |
| `ValidationError` | `VALIDATION` | `validation_error` | A state document fails its schema; carries `issues` |

## Run errors

A failed run stores `{ code, message }` in `run.error`. For budget, timeout and fatal tool failures the code is the error's code. Any other thrown value gets its own `code` if it has a string one, else `Error`.

<<< @/snippets/errors.ts#run-error

## Errors without a caller

Some errors happen where nobody awaits: a lost lease, a failed notification, a listener that throws, a failed recovery pass. They go to `onError(error, run?)`, by default `console.error`. Pass your logger. A `LeaseLostError` there is informational: another replica carries the run on.

<<< @/snippets/errors.ts#on-error
