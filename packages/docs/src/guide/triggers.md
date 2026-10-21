# Triggers & the Envelope

A trigger describes how a run of an agent can start. At intake every trigger becomes the same shape, a `TriggerEnvelope`, and `engine.dispatch()` turns the envelope into a `queued` run.

## Trigger definitions

<<< @/snippets/triggers.ts#definitions

| Builder | Source | Id | Options |
|---|---|---|---|
| `http(opts?)` | `http` | `http` | `schema?`: a Standard Schema for the payload. At most one per agent; REST, the UI and MCP start runs through it |
| `webhook(opts)` | `webhook` | `webhook:<path>` | `path` (starts with `/`), `schema?`, `idempotencyKey?`, `concurrencyKey?`. Many per agent |
| `cron(expression, opts?)` | `cron` | `cron:<expression>` | `timezone?`, `overlap?` (`skip` by default, `queue-one`, `allow`), `payload?` |
| `githubWebhook(opts)` from `@chamvi/github` | `github` | `github:<events>` | `events` (`'issues'` or `'issues.opened'`), `id?`, `filter?`, `idempotencyKey?` (default the delivery id), `concurrencyKey?` (default `<owner>/<repo>#<number>`). See [GitHub App](/deployment/github-app) |

`cron()` validates the expression (and timezone) with cron-parser and throws `InvalidAgentDefinitionError` for an invalid one; `webhook()` throws it for a path that does not start with `/`. Trigger ids must be unique per agent, so an agent declares `http()` at most once.

A `TriggerDefinition` may also carry `concurrencyKey(payload)` and `idempotencyKey(payload)` functions (`webhook()` copies them from its options). They are meant for the intake packages, which compute the envelope keys from a payload.

::: warning Firing triggers is not in core
In `@chamvi/core`, `engine.dispatch()` is the only way a run starts. The trigger definitions describe intent; nothing in core fires a cron expression or listens on an HTTP path. [`@chamvi/scheduler`](/guide/scheduler) fires `cron()` triggers (with per-tick locks and the overlap policy); [`@chamvi/http`](/guide/http) serves `http()` triggers over REST and MCP and `webhook()` triggers at `/hooks/:agent<path>`; [`@chamvi/github`](/deployment/github-app) serves `githubWebhook()` triggers at `/webhooks/github`.
:::

## The envelope

<<< ../../../core/src/trigger/types.ts{ts}

`dispatch()` takes the envelope without `id` and `receivedAt`; it fills in a random UUID and the current time. `trigger` is the trigger id (`'http'`, `'webhook:/issues'`, ...). `source` is one of `cron`, `http`, `webhook`, `github` or `mcp` (a run started through `http()` over MCP has `trigger: 'http'` and `source: 'mcp'`).

The engine renders the source, trigger id and payload as a JSON block and makes it the run's first user message. The model sees exactly that; put what it needs into the payload.

`thread` is stored on the run. Loading the history of earlier runs of the same thread is planned for the mail digest milestone.

`invoker` is who started the run. Only an intake layer sets it, from its authenticated caller (`@chamvi/http` fills it from the principal), never from a payload. It is not part of the rendered block, so the model never sees it. See [Restricting tools per invoker](/guide/tools#restricting-tools-per-invoker).

## Attachments

`dispatch()` also takes files for the model, `attachments: [{ mediaType, filename?, data }]` with `data` a `Uint8Array`:

<<< @/snippets/triggers.ts#attachments

Each attachment is checked before anything is written (`mediaType` of the form `type/subtype` without parameters, `data` a `Uint8Array`; `ValidationError` otherwise), then stored as an [artifact](/guide/agents#files) of the run, after the idempotency check (a deduplicated dispatch stores nothing) and before the run is created. The run's `trigger.attachments` holds their metadata. The first user message then carries the rendered envelope as text followed by one file part per attachment, so a model that reads images or PDFs gets them directly. Attachment ids are derived from the run id and the position (`<runId>.0000`, `<runId>.0001`, ...), so the run's artifacts list in the order they were given. A crash between storing the files and creating the run leaves orphan artifacts; nothing purges them yet. Two dispatches that race to create the run of the same reserved idempotency key (its first run was never created) write to the same ids, so the second write of each file is a no-op and the run names exactly the files that were stored; only a racing dispatch with more files than the winner leaves its extra files listed among the run's artifacts.

Over HTTP, `POST /agents/:name/runs` takes the same list with `data` as base64 (see [HTTP API](/guide/http#files)).

## Idempotency keys

<<< @/snippets/triggers.ts#dispatch

With an `idempotencyKey`, `dispatch()` claims the key in the store under the scope `<agent>:<source>` (for example `triage:webhook`) for 7 days. The first dispatch creates the run. Every later dispatch with the same agent, source and key returns the existing run id with `deduplicated: true`, and no new run is created.

A dispatch with an [invoker](#the-envelope) claims the key under `<agent>:<source>:<kind>:<id>` instead (`kind` and `id` URI-encoded). Keys are then per invoker: the same invoker's retry is deduplicated, while another invoker sending the same key gets a run of its own and never learns about the first.

Use a key that is stable across redeliveries: a GitHub delivery id, a cron job plus its scheduled time, or a key your client sends.

If the store claimed the key but the run was never created (for example `createRun` failed right after the claim), the next dispatch with that key creates the run under the reserved id. `createRun` is insert-if-absent, so concurrent dispatches create it once.

## Concurrency keys

A run with a `concurrencyKey` starts only when no other run of the same agent with the same key is `running`, `waiting` or `interrupted`. Runs with different keys, and runs without a key, run in parallel up to the engine's `maxConcurrentRuns`. See [Concurrency, Leases & Multi-Replica](/guide/concurrency).

Typical keys: one per repository, issue or pull request (`acme/app#42`), or one per mailbox.
