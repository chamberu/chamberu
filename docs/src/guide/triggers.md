# Triggers & the Envelope

A trigger describes how a run of an agent can start. At intake every trigger becomes the same shape, a `TriggerEnvelope`, and `engine.dispatch()` turns the envelope into a `queued` run.

## Trigger definitions

<<< @/snippets/triggers.ts#definitions

| Builder | Source | Id | Options |
|---|---|---|---|
| `manual(opts?)` | `manual` | `manual` | `schema?`: a Standard Schema for the payload |
| `http(opts?)` | `http` | `http:<path>` (path defaults to `/`) | `path?`, `schema?` |
| `cron(expression, opts?)` | `cron` | `cron:<expression>` | `timezone?`, `overlap?` (`skip` by default, `queue-one`, `allow`), `payload?` |

`cron()` validates the expression (and timezone) with cron-parser and throws `InvalidAgentDefinitionError` for an invalid one. Trigger ids must be unique per agent.

A `TriggerDefinition` may also carry `concurrencyKey(payload)` and `idempotencyKey(payload)` functions. They are meant for the intake packages, which compute the envelope keys from a payload.

::: warning Firing triggers is not in core
In `@chamberu/core`, `engine.dispatch()` is the only way a run starts. The trigger definitions describe intent; nothing in core fires a cron expression or listens on an HTTP path. That is the job of the planned [`@chamberu/scheduler`](/roadmap#planned-packages) (cron, with per-tick locks and the overlap policy) and [`@chamberu/http`](/roadmap#planned-packages) (webhooks, REST and MCP). Until then, call `dispatch()` from your own handler or timer.
:::

## The envelope

<<< ../../../packages/core/src/trigger/types.ts{ts}

`dispatch()` takes the envelope without `id` and `receivedAt`; it fills in a random UUID and the current time. `trigger` is the trigger id (`'manual'`, `'http:/issues'`, ...). `source` is one of `cron`, `http`, `github`, `mcp` or `manual`.

The engine renders the source, trigger id and payload as a JSON block and makes it the run's first user message. The model sees exactly that; put what it needs into the payload.

`thread` is stored on the run. Loading the history of earlier runs of the same thread is planned for the mail digest milestone.

## Idempotency keys

<<< @/snippets/triggers.ts#dispatch

With an `idempotencyKey`, `dispatch()` claims the key in the store under the scope `<agent>:<source>` for 7 days. The first dispatch creates the run. Every later dispatch with the same agent, source and key returns the existing run id with `deduplicated: true`, and no new run is created.

Use a key that is stable across redeliveries: a GitHub delivery id, a cron job plus its scheduled time, or a key your client sends.

If the store claimed the key but the run was never created (for example `createRun` failed right after the claim), the next dispatch with that key creates the run under the reserved id. `createRun` is insert-if-absent, so concurrent dispatches create it once.

## Concurrency keys

A run with a `concurrencyKey` starts only when no other run of the same agent with the same key is `running`, `waiting` or `interrupted`. Runs with different keys, and runs without a key, run in parallel up to the engine's `maxConcurrentRuns`. See [Concurrency, Leases & Multi-Replica](/guide/concurrency).

Typical keys: one per repository, issue or pull request (`acme/app#42`), or one per mailbox.
