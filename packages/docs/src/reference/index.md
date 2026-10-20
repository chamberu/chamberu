# @chamberu/core

The public API of `@chamberu/core`, taken from `packages/core/src/index.ts`. Contract interfaces carry an `I` prefix (`IStore`, `IClock`, `INotifier`, `IAgentState`); data shapes are unprefixed types.

```ts
import { RunEngine, defineAgent } from '@chamberu/core';
```

Test helpers live in [`@chamberu/test-kit`](/reference/test-kit).

## Agents

```ts
function defineAgent<S extends StateSchema = StateSchema>(def: AgentDefinition<S>): Agent<S>;

const DEFAULT_MAX_STEPS: 20;
const DEFAULT_TIMEOUT_MS: 900_000; // 15 minutes
```

Throws `InvalidAgentDefinitionError` for an invalid name or duplicate trigger ids. See [Agents](/guide/agents).

<<< ../../../core/src/agent/types.ts{ts}

## Permissions

```ts
function matchesPermission(granted: string, wanted: string): boolean;
function hasPermission(permissions: readonly string[], wanted: string): boolean;
function toolPermission(agent: string, tool: string): string; // tool:<agent>:<tool>
function requireToolPermission(opts?: RequireToolPermissionOptions): ToolPolicy;
```

`*` alone grants everything, a `*` segment matches exactly one segment, and segment counts must match. `requireToolPermission()` offers a tool when the run's invoker holds `toolPermission(agent, tool)`; runs without an invoker follow `withoutInvoker` (default `'deny'`). See [Restricting tools per invoker](/guide/tools#restricting-tools-per-invoker).

<<< ../../../core/src/permission/types.ts{ts}

## Triggers

```ts
function cron(expression: string, opts?: CronOptions): TriggerDefinition;
function http(opts?: HttpTriggerOptions): TriggerDefinition;
function webhook(opts: WebhookTriggerOptions): TriggerDefinition;
```

`TriggerSource`, `TriggerDefinition` and `TriggerEnvelope`:

<<< ../../../core/src/trigger/types.ts{ts}

`CronOptions` and `OverlapPolicy`, `HttpTriggerOptions`, `WebhookTriggerOptions`:

<<< ../../../core/src/trigger/cron/types.ts{ts}

<<< ../../../core/src/trigger/http/types.ts{ts}

<<< ../../../core/src/trigger/webhook/types.ts{ts}

See [Triggers & the Envelope](/guide/triggers).

## RunEngine

```ts
class RunEngine {
    constructor(opts: RunEngineOptions);

    dispatch(envelope: DispatchEnvelope): Promise<{ runId: string; deduplicated: boolean }>;
    getRun(id: string): Promise<Run | undefined>;
    on(event: RunEvent['type'], listener: (e: RunEvent) => void): () => void;

    start(): Promise<void>;
    stop(): void;
    drain(opts?: { timeoutMs?: number }): Promise<void>;
    idle(): Promise<void>;
    readonly isDraining: boolean;

    cancel(runId: string): Promise<void>;
    resume(token: string, decision: ResumeDecision): Promise<void>;
    tick(): Promise<void>;
    recover(): Promise<number>;
}
```

| Method | Description | Guide |
|---|---|---|
| `dispatch` | Stores a `queued` run (and its attachments as artifacts); deduplicates by `idempotencyKey` | [Triggers](/guide/triggers) |
| `getRun` | Reads a run from the store | [Run Lifecycle](/guide/run-lifecycle) |
| `on` | Subscribes to `run.updated`, `step.appended` or `run.delta`; returns an unsubscribe function | [Run Lifecycle](/guide/run-lifecycle#watching-runs) |
| `start` | Recovers, starts polling and starts queued runs | [Recovery](/guide/recovery) |
| `stop` | Stops polling only | [Recovery](/guide/recovery) |
| `drain` | Waits for in-flight runs (default 30 s), then marks the rest `interrupted` | [Recovery](/guide/recovery#drain) |
| `idle` | Resolves when nothing runs and nothing more can start | |
| `cancel` | Cancels locally, in the store, or requests it from the owning replica | [Recovery](/guide/recovery#cancel) |
| `resume` | Answers the approval a waiting run waits on | [Approvals](/guide/approvals) |
| `tick` | Denies expired approvals and re-sends undelivered notifications; runs every poll | [Approvals](/guide/approvals) |
| `recover` | Requeues abandoned runs; runs on start and every poll | [Recovery](/guide/recovery#recovery) |

<<< ../../../core/src/engine/types.ts{ts}

| Option | Default |
|---|---|
| `notifiers` | `{}` |
| `owner` | `` `${hostname}-${pid}` `` |
| `maxConcurrentRuns` | `4` |
| `claimTtlMs` | `60_000`, renewed and polled every `claimTtlMs / 3` |
| `clock` | `systemClock` |
| `onError` | logs to `console.error` |

`ApprovalRequest` (`{ approvalId, toolName, input }`) is the tool call a waiting run waits on.

## Runs

`Run`, `RunStatusLiteral`, `RunContext`, `Step`, `Checkpoint`, `WaitPoint`, `Budget` and `Usage`:

<<< ../../../core/src/run/types.ts{ts}

The `RunStatus` enum, whose values `RunStatusLiteral` is built from:

<<< ../../../core/src/run/constants.ts{ts}

## Stores

```ts
class MemoryStore implements IStore {
    constructor(opts?: { clock?: IClock });
}
```

`IStore` and its parts (`IRunStore`, `IStepStore`, `ICheckpointStore`, `IIdempotencyStore`, `ILockStore`, `IEffectStore`, `IStateStore`, `IArtifactStore`) are listed on the [Store Contract](/stores/) page.

## Artifacts

`Artifact` (metadata), `ArtifactInput` (a file to store) and `IRunArtifacts` (the tool factory's `artifacts`):

<<< ../../../core/src/artifact/types.ts{ts}

See [Files](/guide/agents#files) and [Attachments](/guide/triggers#attachments).

## Effect tools

```ts
function defineEffectTool<I, O>(def: Tool<I, O> & {
    effectKey?: (input: I, ctx: RunContext) => string;
    alreadyApplied?: (effectKey: string, input: I, ctx: RunContext) => Promise<O | undefined>;
}): EffectTool<I, O>;

function effectMarker(effectKey: string): string; // '<!-- chamberu:effect=<key> -->'

function wrapToolsForRun(tools: ToolSet, ctx: RunContext, store: IEffectStore): ToolSet;

const EFFECT: unique symbol; // marks a tool as an effect tool
```

See [Effect Tools & Reconciliation](/guide/effect-tools).

## Approvals

```ts
function createResumeToken(secret: string, p: ResumeTokenClaims & { expiresAt: Date }): string;
function verifyResumeToken(secret: string, token: string, now: Date): ResumeTokenClaims;

type ResumeTokenClaims = { runId: string; approvalId: string; tokenId: string };
```

`verifyResumeToken` throws `InvalidResumeTokenError` for every failure. See [Approvals & Resume Tokens](/guide/approvals).

## State

```ts
function createAgentState<S extends StateSchema = StateSchema>(
    agent: string,
    schema: S | undefined,
    store: IStateStore,
): IAgentState<S>;

function createStateTools<S extends StateSchema>(state: IAgentState<S>, schema: S): ToolSet;
```

<<< ../../../core/src/state/types.ts{ts}

See [Agent State](/guide/state).

## Notifiers

`INotifier` and `Notification`:

<<< ../../../core/src/notify/types.ts{ts}

See [Notifiers](/guide/notifiers).

## Clock

```ts
const systemClock: IClock;
```

<<< ../../../core/src/clock/types.ts{ts}

`systemClock` timers never keep the process alive unless `keepAlive` is set; only the drain deadline sets it.

## Errors

`ChamberuError`, `InvalidAgentDefinitionError`, `InvalidResumeTokenError`, `InvalidRunStateError`, `RunNotFoundError`, `ArtifactNotFoundError`, `BudgetExceededError`, `TimeoutError`, `FatalToolError`, `ToolNotAllowedError`, `LeaseLostError`, `ValidationError` and `ErrorCode`:

<<< ../../../core/src/errors/constants.ts{ts}

See [Errors](/guide/errors) for when each is thrown.
