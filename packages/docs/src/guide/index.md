# Overview

This guide describes `@chamberu/core` as it is built today. Every sample on these pages type-checks against the current source.

## The concepts

| Concept | In core | What it is |
|---|---|---|
| **Agent** | `defineAgent()` | A model, instructions, triggers, tools, a budget, approvals and state |
| **Trigger** | `cron()`, `http()`, `webhook()` | How a run can start. Normalized into a `TriggerEnvelope` at intake |
| **Run** | `Run` | One execution of an agent for one envelope, with a status, usage and output |
| **Step** | `Step` | An `llm`, `tool` or `wait` record, appended as the run progresses |
| **Checkpoint** | `Checkpoint` | The message history after a step; a resumed run continues from the latest one |
| **Tool** | AI SDK `tool()`, `defineTool()`, `defineEffectTool()` | What the model can call. `defineTool()` tools read the run context; effect tools apply at most once per effect key |
| **State** | `AgentState` | Per-agent key-value data and typed collections that outlive runs |
| **Notifier** | `Notifier` | Delivers approval requests and other messages to the owner |
| **Store** | `Store` | Runs, steps, checkpoints, keys, locks, effects and state. Pluggable |

The **App** and **Workspace** concepts (an app with HTTP, scheduler and UI, and sandboxed workspaces for coding) belong to [planned packages](/roadmap).

## The engine in one picture

```
             dispatch(envelope)
                    |
        idempotency key seen? ----yes----> existing run id
                    | no
                    v
               [ queued ] <--------------------------------+
                    | slot free, key free, claim taken     |
                    v                                      |
               [ running ] --- step --> checkpoint         |
                    |                                      |
   +----------------+-----------------+-----------------+  |
   |                |                 |                 |  |
completed         failed          cancelled        waiting -- resume / timeout
                                                    interrupted -- recover
```

See [Run Lifecycle](/guide/run-lifecycle) for every transition.

## Reading order

1. [Agents](/guide/agents) and [Triggers & the Envelope](/guide/triggers)
2. [Run Lifecycle](/guide/run-lifecycle) and [Execution & Checkpoints](/guide/execution)
3. [Budgets](/guide/budgets), [Tools](/guide/tools), [Effect Tools](/guide/effect-tools), [Approvals](/guide/approvals), [State](/guide/state)
4. [Concurrency](/guide/concurrency), [Cancel, Drain & Recovery](/guide/recovery), [Notifiers](/guide/notifiers), [Errors](/guide/errors)
