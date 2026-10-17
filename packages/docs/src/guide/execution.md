# Execution & Checkpoints

One execution is one call of an AI SDK `ToolLoopAgent` for one claimed, `running` run. A run may take several executions: one before an approval pause and one after, or one before a crash and one after recovery.

## What an execution does

1. **Load the start point.** The latest checkpoint's messages, or, for a new run, a single user message with the rendered trigger envelope.
2. **Re-pause if needed.** If the checkpoint ends on an approval request nobody answered, the run goes back to `waiting` without a model call.
3. **Check the step budget.** If an earlier execution already used every step, the run settles right away (see [Budgets](/guide/budgets)).
4. **Assemble the tools.** Generated [state tools](/guide/state) plus the result of your `tools` factory, with every [effect tool](/guide/effect-tools) wrapped.
5. **Run the loop.** `ToolLoopAgent` with your model and instructions, the `toolApproval` derived from `approvals`, and stop conditions for the step and token budgets.
6. **After every step:** append the `llm` step and one `tool` step per tool result or error, save a checkpoint, and update the run's token usage.
7. **Settle.** `completed`, `failed`, `cancelled`, `waiting` (approval) or, during a drain, `interrupted`.

## Checkpoints

A `Checkpoint` holds the full message history after a step, the step index and the AI SDK finish reason of that step.

<<< ../../../core/src/run/types.ts{ts}

The store keeps the checkpoint with the highest `stepIndex` per run; saving one with an equal index replaces it. That is how an approval response is appended to the history of the step that asked for it.

Because the engine saves a checkpoint after every completed step, a recovered run repeats at most the step that was in progress when the process died. If that step called tools, they run again, which is why tools with side effects should be [effect tools](/guide/effect-tools).

### Writes around an abort

A cancel or drain aborts the model call, but the writes of a step that already completed (its tool rows and checkpoint) are allowed to finish before the run settles. A recovery then does not redo a step whose tools already ran. Once the run has settled, a model call that is still running cannot write anymore.

## Ownership

Every write of a `running` run is conditional on the status and on the engine holding the run's claim. If another engine took the run over (because this one's lease expired), the execution is aborted, writes nothing more and reports a `LeaseLostError` to `onError`. The run is not failed: its new owner carries it on. See [Concurrency, Leases & Multi-Replica](/guide/concurrency).

## The first message

The model sees the trigger as a JSON block:

````md
```json
{
  "source": "manual",
  "trigger": "manual",
  "payload": {
    "title": "App crashes on start"
  }
}
```
````

`id`, keys, `thread` and `receivedAt` are not part of the message; they are available to tools through `run.trigger`.
