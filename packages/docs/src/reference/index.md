# @chamvi/core

The public API of `@chamvi/core`, taken from `packages/core/src/index.ts`. Contract interfaces carry an `I` prefix (`IStore`, `IClock`, `INotifier`, `IAgentState`); data shapes are unprefixed types.

```ts
import { Engine, defineAgent } from '@chamvi/core';
```

Test helpers live in [`@chamvi/test-kit`](/reference/test-kit).

## Agents

```ts
function defineAgent<S extends StateSchema = StateSchema>(def: AgentDefinition<S>): Agent<S>;

const DEFAULT_MAX_STEPS: 20;
const DEFAULT_TIMEOUT_MS: 900_000; // 15 minutes
```

Throws `InvalidAgentDefinitionError` for an invalid name, duplicate trigger ids, or a `toolsContext` entry naming a chamvi tool or no tool of a plain tool set. See [Agents](/guide/agents).

`AgentConfig` is the definition without `name`, the default export of a folder agent's `agent.ts`; `AgentRevision` is the store's revision marker of a folder agent (see [Agent Folders](/guide/agent-folders)):

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

## Engine

```ts
class Engine {
    constructor(opts: EngineOptions);

    readonly store: IStore;
    readonly clock: IClock;
    getAgent(name: string): Agent | undefined;
    listAgents(): Agent[];
    putAgent(agent: Agent, options?: { revision?: string }): Promise<'added' | 'replaced' | 'unchanged'>;
    removeAgent(name: string): Promise<boolean>;
    agentRevision(name: string): string | undefined;
    provide<T>(key: ContextKey<T>, value: T): void; // IContextProvider, see Context

    dispatch(envelope: DispatchEnvelope): Promise<{ runId: string; deduplicated: boolean }>;
    getRun(id: string): Promise<Run | undefined>;
    on<T extends EngineEvent['type']>(event: T, listener: (e: Extract<EngineEvent, { type: T }>) => void): () => void;

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
| `store`, `clock` | The store and clock the engine was built with (`clock` defaults to `systemClock`) | |
| `getAgent`, `listAgents` | One registered agent by name; all of them in registration order (a new array), read at call time | |
| `putAgent` | Registers an agent or replaces the one of the same name in place (a new one goes last); refuses an unknown `notify` like the constructor. Replacing cancels the agent's unsettled runs created before now. With a `revision` (a folder's content hash) the store's marker is brought to it under the lock `agents:<name>` instead, cancelling once across replicas and only when a marker existed (swept before and again after the marker write; no run of the agent starts on this engine meanwhile). Resolves `unchanged` (no event) for the same agent object at the same revision | [Agent Folders](/guide/agent-folders) |
| `removeAgent` | Unregisters the agent here first (no further dispatch), then under the same lock cancels its unsettled runs and deletes its marker (when it has one, unless this engine had it at another revision: a newer one registered elsewhere stays), or without a marker cancels the runs of an agent registered here; resolves whether it was registered here | [Agent Folders](/guide/agent-folders) |
| `agentRevision` | The revision an agent was registered at; `undefined` for a code agent | |
| `dispatch` | Stores a `queued` run (and its attachments as artifacts); deduplicates by `idempotencyKey` | [Triggers](/guide/triggers) |
| `getRun` | Reads a run from the store | [Run Lifecycle](/guide/run-lifecycle) |
| `on` | Subscribes to `run.updated`, `step.appended`, `run.delta` or `agents.changed`; returns an unsubscribe function | [Run Lifecycle](/guide/run-lifecycle#watching-runs) |
| `start` | Recovers, starts polling and starts queued runs: only runs of an agent it holds, a folder agent only at the stored revision (the others stay `queued`) | [Recovery](/guide/recovery) |
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

`IStore` and its parts (`IRunStore`, `IStepStore`, `ICheckpointStore`, `IIdempotencyStore`, `ILockStore`, `IEffectStore`, `IStateStore`, `IArtifactStore`, `IAgentRevisionStore`) are listed on the [Store Contract](/stores/) page.

## Artifacts

`Artifact` (metadata), `ArtifactInput` (a file to store) and `IRunArtifacts` (the tool context's `artifacts`):

<<< ../../../core/src/artifact/types.ts{ts}

`isArtifactMediaType(value: unknown): value is string` is the media type rule `dispatch` and `artifacts.put()` apply: `type/subtype` (RFC 6838 restricted names) without parameters. An intake layer can check attachments with it before dispatching (`@chamvi/http` does).

See [Files](/guide/agents#files) and [Attachments](/guide/triggers#attachments).

## Tools

```ts
function defineTool<I, O, S extends StateSchema = StateSchema>(
    def: Tool<I, O, ToolContext<S>> & {
        execute: ToolExecuteFunction<I, O, ToolContext<S>>;
        contextSchema?: never;
    },
): Tool<I, O, ToolContext<S>>;

const toolContextSchema: StandardSchemaV1<ToolContext, ToolContext>; // vendor 'chamvi'
```

`defineTool()` is `tool()` with `contextSchema: toolContextSchema`; the engine hands the run's `ToolContext` to every tool carrying that schema (by reference, so a copy of the tool keeps it). Its `validate` returns the context unchanged and rejects a missing one, which fails the run (`validation_error`) with `Type validation failed for tool context (<tool>): No chamvi tool context: the tool was built by another copy of @chamvi/core, or runs outside a chamvi agent.` (the marker is the schema object itself, so a tool from a second copy of `@chamvi/core` gets no context).

<<< ../../../core/src/tool/types.ts{ts}

See [Tools and their context](/guide/agents#tools-and-their-context).

## Context

```ts
function defineContextKey<T>(name: string): ContextKey<T>;                      // a new frozen key per call; empty name -> InvalidAgentDefinitionError
function inject<T>(ctx: ToolContext, key: ContextKey<T>): T;                    // else ContextNotProvidedError ('context_not_provided')
function tryInject<T>(ctx: ToolContext, key: ContextKey<T>): T | undefined;
```

`engine.provide(key, value)` (`Engine` implements `IContextProvider`) keeps the value by reference and refuses a foreign key, `undefined` and a second value for one key (`InvalidAgentDefinitionError` naming the key). `inject` reads the engine's values for the `ToolContext` the engine built for the execution (tool `execute`, the tools factory, `alreadyApplied`, `effectKey`); `ToolContext` itself gains no field, and nothing provided is stored or serialized. A missing value is a tool error in `execute` and the effect hooks and fails the run in the factory. See [Context](/guide/tools#context-shared-instances-for-tools).

<<< ../../../core/src/context/types.ts{ts}

## Effect tools

```ts
function defineEffectTool<I, O, S extends StateSchema = StateSchema>(def: Tool<I, O, ToolContext<S>> & {
    execute: ToolExecuteFunction<I, O, ToolContext<S>>;
    contextSchema?: never;
    effectKey?: (input: I, ctx: ToolContext<S>, options: ToolExecutionOptions<ToolContext<S>>) => string;
    alreadyApplied?: (effectKey: string, input: I, ctx: ToolContext<S>) => Promise<O | undefined>;
}): EffectTool<I, O, S>;

function effectMarker(effectKey: string): string; // '<!-- chamvi:effect=<key> -->'

function wrapToolsForRun(
    tools: ToolSet,
    ctx: ToolContext,
    store: IEffectStore,
    allow?: (toolName: string) => boolean,
): ToolSet;

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

function createStateTools<S extends StateSchema>(schema: S): ToolSet; // the tools read context.state
```

<<< ../../../core/src/state/types.ts{ts}

See [Agent State](/guide/state).

## Notifiers

`INotifier`, `Notification`, `NotifyOptions` and `ConsoleNotifierOptions`:

<<< ../../../core/src/notify/types.ts{ts}

```ts
function consoleNotifier(options?: ConsoleNotifierOptions): INotifier;
```

A development notifier: writes `[chamvi] <kind>: <title> (agent <agent>, run <runId>, key <idempotencyKey>)`, the body and, for an approval, `resume token: <token> (expires <ISO>)`, one `write` call per line. It never throws; an empty `name` throws `InvalidAgentDefinitionError`.

See [Notifiers](/guide/notifiers).

## Clock

```ts
const systemClock: IClock;
```

<<< ../../../core/src/clock/types.ts{ts}

`systemClock` timers never keep the process alive unless `keepAlive` is set; only the drain deadline sets it.

## Errors

`ChamviError`, `InvalidAgentDefinitionError`, `AgentNotFoundError`, `ContextNotProvidedError`, `InvalidResumeTokenError`, `InvalidRunStateError`, `RunNotFoundError`, `ArtifactNotFoundError`, `BudgetExceededError`, `TimeoutError`, `FatalToolError`, `IncompleteResponseError`, `ToolNotAllowedError`, `LeaseLostError`, `SandboxError`, `ValidationError` and `ErrorCode`:

<<< ../../../core/src/errors/constants.ts{ts}

See [Errors](/guide/errors) for when each is thrown.
