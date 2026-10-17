# Run Lifecycle

A run has exactly one of seven statuses. `RunStatus` is an enum of them, and `RunStatusLiteral` is the union of its string values, which is the type of `run.status`: compare against the enum, or against the plain string when that reads better.

| Status | `RunStatus` | Meaning | Final |
|---|---|---|---|
| `queued` | `QUEUED` | Stored, waiting for a free slot, a free concurrency key and a claim | no |
| `running` | `RUNNING` | Claimed by one engine, which drives the model and writes steps and checkpoints | no |
| `waiting` | `WAITING` | Paused on a tool call that needs approval; holds no claim and no slot | no |
| `interrupted` | `INTERRUPTED` | Aborted by `drain()`; claim released, waits for `recover()` | no |
| `completed` | `COMPLETED` | The model finished; `output` holds the text of its last answer | yes |
| `failed` | `FAILED` | A budget, a timeout, a `FatalToolError` or an infrastructure error ended it; `error` holds `{ code, message }` | yes |
| `cancelled` | `CANCELLED` | `cancel()` ended it | yes |

<div class="figure">
    <img src="/run-lifecycle.svg" alt="dispatch() stores a queued run, deduplicated by idempotency key. The engine claims it and runs it: every LLM or tool step is followed by a checkpoint in the store. A run ends completed, failed or cancelled. A tool call that needs approval pauses the run in waiting with a signed resume token; approving or denying it requeues the run. drain() or a crashed process leaves a run interrupted or with an expired claim; recover() requeues it, and the next execution continues from the latest checkpoint." />
</div>

## Transitions

```
dispatch ----------------------------> queued
queued   -- slot, key and claim -----> running
running  -- model finished ----------> completed
running  -- budget, timeout, fatal --> failed
running  -- cancel() ----------------> cancelled
running  -- tool call needs approval > waiting
waiting  -- resume() or timeout -----> queued     (then running again)
waiting  -- cancel() ----------------> cancelled
running  -- drain() -----------------> interrupted
interrupted -- recover() ------------> queued     (then running again)
running, claim expired (crash) -- recover() --> queued
queued   -- cancel() ----------------> cancelled
```

Every non-final status can come back to `queued`. The next execution always starts from the latest [checkpoint](/guide/execution), so work that completed before the pause, the drain or the crash is not repeated.

## Steps

While a run executes, the engine appends `Step` records to the store:

| Kind | Written when | `name` | `input` / `output` |
|---|---|---|---|
| `llm` | after every model call | the model id | output: text, tool calls, finish reason, token usage |
| `tool` | for every tool result or tool error of that step | the tool name | the tool input and its output, or `error: { code, message }` |
| `wait` | when an approval is answered | the tool name | the tool input; output `{ approvalId, approved, reason }` |

Steps are append-only and numbered per run (`index`). They are the run's audit log; the checkpoint, not the steps, is what a resumed run continues from.

## Watching runs

`engine.on()` subscribes to `run.updated` (any status, usage or wait point change) and `step.appended`. It returns an unsubscribe function. A listener that throws is reported to `onError` and does not affect the run.

<<< @/snippets/lifecycle.ts#events

`engine.getRun(id)` reads the current state from the store. `engine.idle()` resolves once nothing is running in this process and nothing more can be started, which is useful in tests and scripts.
