# Architecture

## Core Concepts

App, Agent, Trigger, Run, Step, State, Tool, Workspace, Notifier, Store. Keep the concept surface at about ten. chamberu never wraps the AI SDK: models, messages and tool sets are passed through as-is.

## Agents

`defineAgent({...})` takes a typed config object. Agent names match `^[a-z0-9]+(-[a-z0-9]+)*$`, at most 64 chars, unique per app.

## Triggers and the Envelope

Every trigger is normalized into one envelope, then becomes a Run:

```ts
interface TriggerEnvelope {
    id: string;
    agent: string;
    source: 'cron' | 'http' | 'github' | 'mcp' | 'manual';
    payload: unknown;
    idempotencyKey: string;
    receivedAt: Date;
}
```

Trigger sources are exactly `cron | http | github | mcp | manual`. The cron overlap policy is stored on the trigger definition and defaults to `skip` (others: `queue-one`, `allow`); enforcement comes later.

## Run Lifecycle

Envelope -> Run -> Steps (llm | tool | wait | sandbox).

Run statuses are exactly `queued | running | waiting | completed | failed | cancelled | interrupted`.

```
queued -> running -> waiting (approval/input) -> running
running -> completed | failed | cancelled
running -> interrupted (process restart) -> resumed from last checkpoint
```

- A checkpoint (messages + tool results) is written after every step. On restart, `interrupted` runs resume from the last checkpoint.
- `waiting` runs carry a signed resume token; resume via REST, UI or MCP, with a timeout and a default action.
- Concurrency: a per-agent `concurrencyKey` allows one run at a time per key.
- Budgets (steps, tokens, timeout) are enforced as stop conditions and an abort signal.

## Store Contract

The store is a set of small interfaces combined as `Store`:

| Interface | Holds |
|-----------|-------|
| `RunStore` | Runs and their status transitions |
| `StepStore` | Steps per run |
| `CheckpointStore` | Latest checkpoint per run |
| `IdempotencyStore` | Trigger dedupe keys (GitHub delivery id, cron `(job, scheduledAt)`, client key) |
| `LockStore` | Leases and per-tick locks (safe with replicas > 1) |
| `EffectStore` | Step memoization and effect records keyed by `(runId, stepId)` / `effectKey` |
| `StateStore` | Agent state (KV plus typed collections) that outlives runs |

Planned (not implemented yet): `MemoryStore` (in `@chamberu/core`, dev and tests) and a TypeORM/Postgres store. `describeStoreContract()` will be a shared test suite every implementation must pass. Redis is never required.

## Idempotency and Side Effects

1. Trigger dedupe at intake via `IdempotencyStore`.
2. Step memoization by `(runId, stepId)`, so a resumed run does not repeat a tool call.
3. Side-effecting tools use `defineEffectTool()` with an `effectKey` per call and an optional `alreadyApplied(effectKey)` check, reconciling before acting. The goal is effectively-once for external effects.

## Agent State

KV (`state.get/set`) plus typed collections declared in `defineAgent`, exposed to the model as generated tools and to code.
