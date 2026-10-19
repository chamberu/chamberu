# Architecture

## Core Concepts

App, Agent, Trigger, Run, Step, State, Tool, Workspace, Notifier, Store. Keep the concept surface at about ten. chamberu never wraps the AI SDK: models (`LanguageModel`), messages (`ModelMessage`) and tool sets (`ToolSet`) are passed through as-is.

`@chamberu/core` (as built in plan 001) holds: agent and trigger definitions, the `RunEngine`, step checkpoints, budgets, effect tools, approvals with signed resume tokens, recovery and drain, agent state, the `IStore`/`INotifier` interfaces, `MemoryStore`. Everything time-based goes through an injectable `IClock` (`systemClock`; `ControllableClock` in tests). The public surface is `src/index.ts`. `@chamberu/test-kit` exports `describeStoreContract` and `ControllableClock`.

## Engine

`new RunEngine({ store, agents, resumeSecret, ... })` validates at construction (`InvalidAgentDefinitionError`): `resumeSecret` must be non-empty, agent names unique, every `notify` must name a key of `notifiers`. Defaults: `claimTtlMs` 60 s, `maxConcurrentRuns` 4, `owner` `${hostname}-${pid}`, `clock` `systemClock`, `onError` logs to `console.error`. `start()` recovers and begins polling; `dispatch`, `cancel`, `resume`, `tick`, `recover` and `drain` are the operations.

## Agents

`defineAgent({...})` takes a typed config object and returns `{ name, definition }` with the budget defaults applied (`maxSteps: 20`, `timeoutMs: 15 min`). Agent names match `^[a-z0-9]+(-[a-z0-9]+)*$`, at most 64 chars, unique per app; trigger ids must be unique per agent (`InvalidAgentDefinitionError` otherwise). `tools` is a factory `({ state, run }) => ToolSet`, called per execution. `approvals` maps tool names to `'user'` or a policy function (`'user' | 'allow' | 'deny'`), translated to the AI SDK's `toolApproval`. `notify` names a notifier registered on the engine (checked in the `RunEngine` constructor).

## Triggers and the Envelope

`cron()`, `http()` and `manual()` build `TriggerDefinition`s (`{ source, id, options, concurrencyKey?, idempotencyKey? }`). `cron()` validates the expression with cron-parser and stores the overlap policy (default `skip`; others `queue-one`, `allow`), enforced by `@chamberu/scheduler` (see [Scheduler](#scheduler)). Firing cron and HTTP triggers is not part of core: `engine.dispatch(envelope)` is the only intake.

```ts
interface TriggerEnvelope {
    id: string;              // defaults to a UUID
    agent: string;
    trigger: string;         // trigger id, e.g. 'manual'
    source: 'cron' | 'http' | 'github' | 'mcp' | 'manual';
    payload: unknown;
    idempotencyKey?: string;
    concurrencyKey?: string;
    thread?: string;
    receivedAt: Date;        // defaults to now
}
```

The envelope (source, trigger, payload) is rendered as a JSON block and becomes the run's first user message.

## Run Lifecycle

Run statuses are exactly `queued | running | waiting | completed | failed | cancelled | interrupted`. Steps are `llm | tool | wait`.

```
dispatch -> queued -> running -> completed | failed | cancelled
running -> waiting (approval) -> queued (resume or timeout answers it) -> running
running -> interrupted (drain) -> queued (recover) -> running
running with an expired claim (crash) -> queued (recover) -> running
```

- **Intake**: with an `idempotencyKey`, `dispatch` claims `(agent:source, key)` in the `IIdempotencyStore` (TTL 7 days); a duplicate returns the existing run id with `deduplicated: true`. A key whose run was never created (createRun failed after the claim) is healed by the next dispatch, which creates the run under the reserved id; `createRun` is insert-if-absent, so concurrent healers create it once.
- **Scheduling** (`engine/queue.ts`): a pass lists `queued` runs FIFO (createdAt, then id) and starts them up to `maxConcurrentRuns`. A keyed run starts only when no other run of the same agent and `concurrencyKey` is `running`, `waiting` or `interrupted`; check, claim and transition happen under a store lock `concurrency:<agent>:<key>` so it holds across replicas.
- **Claims**: `claimRun(id, owner, claimTtlMs)` is a lease, renewed every `claimTtlMs / 3`. The poll runs on the same interval and calls `tick()` (approval expiry) and `recover()`. Every write of a running run is conditional on status and owner; an engine that loses its lease aborts the execution, writes nothing more and reports a `LeaseLostError` to `onError`.
- **Execution** (`engine/execute.ts`): one `ToolLoopAgent` call per execution, starting from the latest checkpoint. After every step the engine appends the steps and saves a checkpoint (messages plus the step's `finishReason`). A cancel or drain abort lets the step-end writes in flight finish (all tool rows and the checkpoint of a completed step), so a recovery does not redo a step whose tools already ran; an abandon guard then stops a still-running generate from writing after the run settled.
- **Budgets** (`engine/budget.ts`): `maxSteps` and `maxTokens` are stop conditions, `timeoutMs` an abort signal per execution (built on the `IClock`). Stopped by a budget while the last step asked for tool calls: `failed` with `BudgetExceeded`; otherwise `completed`. Timeout: `failed` with `Timeout`.
- **Tool errors** go back to the model as tool-error results; only `FatalToolError` (and infrastructure or store failures) fail the run.
- **Cancel**: aborts a local execution (`cancelled`), or marks a `queued`/`waiting` run cancelled. A run `running` on another replica (or `interrupted`) gets `cancelRequested: true`; the owner sees it in `recover()` on its next poll and aborts with stop `cancel`, and an execution that starts on such a run settles it `cancelled` without a model call. A cancel that races a pause (the abort cannot interrupt the `waiting` write) cancels the run the pause left waiting, without notifying.
- **Drain**: `drain({ timeoutMs })` stops polling and starting runs, waits for in-flight runs (default 30 s), then aborts the rest and marks them `interrupted` with the claim released. `stop()` only stops polling.
- **Recovery**: `recover()` (on `start()` and every poll) claims each `running` or `interrupted` run whose claim expired or was released and requeues it; the next execution continues from the latest checkpoint. A step whose checkpoint never landed runs again.

## Approvals

- A tool call needing approval ends the step; the first unanswered `tool-approval-request` becomes the run's `WaitPoint` (`approvalId`, `toolName`, `input`, `expiresAt`, `tokenId`). Other approval requests from the same step are dropped from the history; the model asks again after the resume (one approval per pause).
- `running -> waiting` releases claim and slot (a keyed run keeps its key blocked). The notifier named by the agent gets one `approval` notification per wait point, carrying a resume token; a successful send records `waiting.notifiedAt`. `tick()` re-sends on every poll while `notifiedAt` is missing (a failed send, or a crash mid-send); a store lock `notify:<run>:<approval>` held for one attempt (at most `claimTtlMs`) keeps replicas from sending concurrently, and the notifier's `idempotencyKey` (`<run>:<approval>`) dedupes a send whose record was lost.
- Resume token: `base64url(JSON { runId, approvalId, tokenId, exp }) + '.' + base64url(HMAC-SHA256(resumeSecret, payload))`, compared in constant time.
- `resume(token, decision)` verifies the token against the current wait point, moves `waiting -> queued` (guarded by `expectStatus`, so only one answer writes), appends the `tool-approval-response` to the checkpoint and a `wait` step, then clears `waiting`. A failure undoes back to `waiting`, so the token stays valid; a crash in between re-pauses on the same wait point.
- `tick()` also denies approvals past `expiresAt` with reason `approval timed out` (default `approvalTimeoutMs` 24 h). A resumed approval gets one step beyond `maxSteps`, so an approval on the last step is still answered.

## Store Contract

The store is a set of small interfaces combined as `IStore` (`src/store/types.ts`):

| Interface | Holds |
|-----------|-------|
| `IRunStore` | Runs; `updateRun` with `expectStatus`/`expectOwner` guards; `listRuns` ordered by createdAt then id, unbounded without `limit`; `claimRun`/`renewClaim` leases |
| `IStepStore` | Append-only steps per run |
| `ICheckpointStore` | Latest checkpoint per run (highest `stepIndex`; equal index replaces) |
| `IIdempotencyStore` | `claimKey(scope, key, runId, ttl)`: first caller wins |
| `ILockStore` | `acquire`/`release` of keyed leases |
| `IEffectStore` | Recorded effect results by effect key |
| `IStateStore` | Per-agent KV and document collections (`where` = top-level equality) |

Rules every implementation must keep: a TTL created at T with `ttlMs` is expired at exactly `T + ttlMs`; values are copied in and out (no aliasing); atomic operations are atomic across callers. `MemoryStore` implements it in-process (structured clones, no await between check and write). `describeStoreContract((clock) => store)` from `@chamberu/test-kit` is the shared Vitest suite every store must pass; the factory must use the given `ControllableClock` for expiry. Redis is never required.

`TypeormStore` (`@chamberu/store-typeorm`) is the TypeORM store (PostgreSQL only). Every method goes through the entities' repositories and query builders; the only hand-written SQL is the `jsonb_exists` key check in `docList` (TypeORM has no key-existence operator), containment uses `JsonContains`; `store/helpers.ts` maps entities to `Run`, `Step` and `Checkpoint` (a `RETURNING` row is hydrated through the entity metadata). Every atomic operation is one statement: `insert().orIgnore()` returning `id` (`createRun`), `insert().orUpdate()` with the overwrite condition `expires_at <= now` returning a row (`claimKey`, `acquire`), a conditional `update()` (`claimRun`, `renewClaim`, the `updateRun` guards, the latter returning `*`) and `insert().orUpdate()` with the overwrite condition `step_index <=` (`saveCheckpoint`). Time comes from the `IClock` as a parameter, never the database's `now()`. Values are `jsonb` through column transformers (`entities/constants.ts`): the Postgres driver writes `JSON.stringify` and turns `null` into SQL `NULL`, so the transformers hand it a `toJSON` wrapper carrying the sanitized value (NUL and lone surrogates become U+FFFD); `JSON_VALUE_TRANSFORMER` (state, docs, effects, checkpoint messages) keeps `null` as JSON `null`, `OPTIONAL_JSON_TRANSFORMER` (run and step columns) stores it as SQL `NULL`. `trigger.receivedAt`, `waiting.expiresAt` and `waiting.notifiedAt` are revived as `Date`. Only the latest checkpoint is kept. `migrateStore(dataSource)` runs the migrations under the advisory lock `chamberu:migrations`; `purgeExpired(now?)` deletes expired idempotency keys and locks (nothing calls it automatically yet). Documented divergences from `MemoryStore`: opaque JSON loses `Date`/`undefined`/`Map` fidelity, `null` in an optional run or step property reads back absent, `putEffect(key, undefined)` reads `{ result: null }`, `docUpsert(..., undefined)` reads `doc: null`, `docList` `where` is `jsonb` containment and orders by `id`, `listRuns` ties use `COLLATE "C"`.

## Idempotency and Side Effects

1. Trigger dedupe at intake via `IIdempotencyStore`.
2. Completed steps are never repeated: execution resumes from the latest checkpoint.
3. Side-effecting tools use `defineEffectTool()`. Per call the wrapper (`wrapToolsForRun`) returns the recorded result for the effect key, else asks `alreadyApplied(effectKey, input, ctx)`, else executes and records the result. The default key is `${runId}:${toolName}:${sha256(canonical JSON of input)}`. A throwing execute records nothing; a crash between the effect and the record repeats it unless `alreadyApplied` finds it (`effectMarker(key)` is the hidden marker to embed). Parallel identical calls in one step share one application.

## Agent State

`createAgentState(agent, schema, store)`: KV (`state.get/set`) plus typed collections declared as `state: Record<name, StandardSchemaV1>` in `defineAgent`. `upsert` validates with the collection's Standard Schema, mapped through `@validup/standard-schema` (`ValidationError` with the validup `issues` on failure, nothing stored). With a schema, the model also gets `state_<coll>_list`, `state_<coll>_upsert` and `state_<coll>_remove` tools (upsert and remove are effect tools); user tools win on a name clash.

## Scheduler

`@chamberu/scheduler` fires `cron()` triggers; it depends on `hubwire` (croner inside) and is a peer of core.

- `createScheduler({ engine, agents, store, owner?, lockTtlMs?, onError? })` builds one hubwire `defineScheduledComponent` per cron trigger, named `cron:<agent>:<triggerId>`, with `lock: createStoreScheduleLock(store, owner)` (`ILockStore.acquire`, never released) and `lockTtlMs` default `SCHEDULE_LOCK_TTL_MS` (10 min). hubwire's tick key is `${name}:${scheduledAt ISO}`. Duplicate agent names and every hubwire definition error (expression croner rejects, timezone, `lockTtlMs`) throw `InvalidAgentDefinitionError` from `createScheduler`, before `start()`.
- `runOnStart: false` always: a start pass never takes hubwire's lock and would fire on every replica. hubwire skips a locked tick fired `lockTtlMs` or more late; `onSkip` is not wired (N - 1 replicas skip every tick). Lock, overlap and dispatch failures reach `onError(error, { agent, trigger })`.
- `fireCronTrigger({ engine, store, agent, trigger, scheduledAt })` is one tick: overlap check, then `dispatch` with source `cron`, payload `options.payload ?? { scheduledAt: ISO }`, idempotency key `<triggerId>@<scheduledAt ISO>` (the trigger's own `idempotencyKey()` is ignored), `concurrencyKey = trigger.concurrencyKey?.(payload) ?? (overlap === 'allow' ? undefined : trigger.id)`.
- Overlap: active runs are `queued | running | waiting | interrupted` of the agent filtered by `run.trigger.trigger`. `skip` skips while any is active, `queue-one` while one is `queued`, `allow` never. The check-then-dispatch race is made harmless by the default concurrency key (the extra run waits).
- Shutdown order: `await scheduler.stop()` (stop, then `settled()` per component), then `await engine.drain()`.
- `runJob({ engine, store, agent, trigger?, clock?, pollMs?, drainTimeoutMs? })` fires once at `clock.now()`, then always starts the engine and calls `engine.tick()` once (so a skipped tick still recovers leftovers of earlier jobs and times out expired approvals), waits via `run.updated` plus an `engine.getRun` poll (`pollMs`, default 1 s, covers another replica) for `completed | failed | cancelled | waiting`, or for `queued` behind a `waiting` run of the same concurrency key (`queue-one` behind an approval), then `drain({ timeoutMs })` (default 30 s). Exit code 1 for `failed`/`cancelled`, else 0; an overlap skip returns `skipped` after the drain. It starts a full engine over the shared store (every queued run of every agent), so size the drain timeout.

## Errors

All errors extend `ChamberuError` (ebec `BaseError`) with a `code`: `InvalidAgentDefinitionError`, `InvalidResumeTokenError`, `BudgetExceededError` (`BudgetExceeded`), `FatalToolError`, `RunNotFoundError`, `InvalidRunStateError`, `LeaseLostError`, `TimeoutError` (`Timeout`), `ValidationError`; the codes are `ErrorCode` (`errors/constants.ts`). A failed run stores `{ code, message }` in `run.error`.
