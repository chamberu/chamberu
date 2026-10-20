<p align="center">
    <img src="https://raw.githubusercontent.com/chamberu/chamberu/master/.github/assets/logo.svg" alt="@chamberu/core" width="128" height="128" />
</p>

<h1 align="center">@chamberu/core</h1>

<p align="center">
    <b>Core engine for self-hosted, trigger-driven AI agents: agents, triggers and durable runs.</b><br>
    You write the agent with the AI SDK. The engine queues its runs, checkpoints every step,<br>
    pauses for approvals and picks interrupted runs up again, in a plain Node process.
</p>

<p align="center">
    <a href="https://www.npmjs.com/package/@chamberu/core"><img src="https://img.shields.io/npm/v/@chamberu/core" alt="npm version" /></a>
    <a href="https://github.com/chamberu/chamberu/actions/workflows/ci.yml"><img src="https://github.com/chamberu/chamberu/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="https://github.com/chamberu/chamberu/blob/master/packages/core/LICENSE"><img src="https://img.shields.io/npm/l/@chamberu/core" alt="License" /></a>
</p>

<p align="center">
    <a href="#installation"><b>Installation</b></a>
    ·
    <a href="#usage">Usage</a>
    ·
    <a href="#options">Options</a>
    ·
    <a href="#api">API</a>
    ·
    <a href="#notes">Notes</a>
</p>

---

## Why @chamberu/core?

The AI SDK runs the model and its tool loop, and stops there. An agent that reacts to webhooks and schedules also needs a place to queue the work, a way to survive a pod restart halfway through a run, a guard against posting the same comment twice after a retry, and a way to wait a day for a human to approve a call. That usually means a hosted orchestrator, or a lot of glue code.

`@chamberu/core` is that layer as a library, with no orchestrator server and no Redis:

| Concern | AI SDK on its own | @chamberu/core |
|---|---|---|
| **Intake** | You call `generateText` from your handler | `dispatch()` stores a `queued` run; an `idempotencyKey` turns a redelivery into the existing run |
| **Concurrency** | Two webhooks for the same issue race each other | One run at a time per `concurrencyKey`, enforced through the store across replicas |
| **Durability** | A crash loses the conversation | A checkpoint after every step; a recovered run continues from the latest one |
| **Side effects** | A retried tool call posts again | `defineEffectTool()` records each result per effect key and can check the remote system before acting |
| **Approvals** | You build the pause, the storage and the callback | The run waits in `waiting` with a signed resume token; `resume(token, decision)` continues it |
| **Limits** | `stopWhen` per call | `maxSteps`, `maxTokens` and `timeoutMs` per run, settled as `completed` or `failed` |
| **Shutdown** | Runs die with the process | `drain()` waits for in-flight runs, then marks the rest `interrupted` for another replica |

Models, messages and tools stay AI SDK types: `defineAgent()` takes a `LanguageModel`, your tool factory returns tools built with `tool()`, and nothing is wrapped in a chamberu type.

<p align="center">
    <img src="https://raw.githubusercontent.com/chamberu/chamberu/master/.github/assets/run-lifecycle.svg" alt="dispatch() stores a queued run, deduplicated by idempotency key. The engine claims it and runs it: every LLM or tool step is followed by a checkpoint in the store. A run ends completed, failed or cancelled. A tool call that needs approval pauses the run in waiting with a signed resume token; approving or denying it requeues the run. drain() or a crashed process leaves a run interrupted or with an expired claim; recover() requeues it, and the next execution continues from the latest checkpoint." width="100%" />
</p>

**Table of Contents**
- [Installation](#installation)
- [Usage](#usage)
  - [Agents and triggers](#agents-and-triggers)
  - [Effect tools](#effect-tools)
  - [Approvals](#approvals)
  - [Agent state](#agent-state)
  - [Stores](#stores)
- [Options](#options)
- [API](#api)
- [Notes](#notes)
- [License](#license)

## Installation

```bash
npm install @chamberu/core ai --save
```

ESM only, Node.js `>=22`. `ai@^7` (the Vercel AI SDK) is a peer dependency; add the provider package of your model as well, for example `@ai-sdk/anthropic`.

## Usage

One agent, an in-memory store and one manually dispatched run:

```typescript
import type { LanguageModel } from 'ai';
import { z } from 'zod';
import {
    MemoryStore,
    RunEngine,
    defineAgent,
    defineEffectTool,
    http,
} from '@chamberu/core';

export async function triageIssue(model: LanguageModel) {
    const labels: string[] = [];

    const triage = defineAgent({
        name: 'triage',
        model,
        instructions: 'Label the issue in the trigger payload as bug, feature or question.',
        triggers: [http()],
        budget: { maxSteps: 5 },
        tools: () => ({
            // the result is recorded per (run, tool, input): a resumed run reuses it
            addLabel: defineEffectTool({
                description: 'Adds a label to the issue.',
                inputSchema: z.object({ label: z.enum(['bug', 'feature', 'question']) }),
                execute: async ({ label }) => {
                    labels.push(label);
                    return { added: label };
                },
            }),
        }),
    });

    const engine = new RunEngine({
        store: new MemoryStore(),
        agents: [triage],
        resumeSecret: 'change-me',
    });
    await engine.start();

    const { runId } = await engine.dispatch({
        agent: 'triage',
        trigger: 'http',
        source: 'http',
        payload: { title: 'App crashes on start' },
    });

    await engine.idle();
    engine.stop();

    return { run: await engine.getRun(runId), labels };
}
```

The run settles `completed`, and its `output` is the text of the model's last answer. This is the code of [`test/fixtures/readme-example.ts`](./test/fixtures/readme-example.ts), which the test suite runs against a scripted model.

### Agents and triggers

- `defineAgent()` checks the name (`^[a-z0-9]+(-[a-z0-9]+)*$`, at most 64 characters) and that trigger ids are unique, and fills in the default budget (`maxSteps: 20`, `timeoutMs: 900_000`).
- `tools` is a factory. It gets the agent's `state` and the run context (`runId`, `agent`, `trigger`, `signal`) and returns an AI SDK `ToolSet`.
- `cron()`, `http()` and `webhook()` describe triggers. `cron()` validates the expression and defaults its overlap policy to `skip`. `http()` is the control-plane trigger (id `http`, at most one per agent) that REST, the UI and MCP start runs through; `webhook({ path })` is a generic webhook (id `webhook:<path>`, many per agent). In this package only `engine.dispatch()` starts runs: firing cron, HTTP and webhook triggers belongs to the scheduler and HTTP packages.
- The trigger envelope (source, trigger id, payload) becomes the run's first user message, as a JSON block.
- `dispatch({ ..., attachments: [{ mediaType, filename?, data }] })` starts a run with files: each is stored as an artifact of the run before the run is created (a deduplicated dispatch stores nothing), its metadata lands on `run.trigger.attachments`, and the model gets the bytes as file parts of the first message. Checkpoints keep a reference, never the bytes; a missing artifact fails the run with code `artifact_not_found`.
- The tool factory also gets `artifacts`, scoped to the run: `put({ mediaType, filename?, data })`, `get(id)` and `list()`. `put()` is no effect by itself; call it inside a `defineEffectTool` to store a file exactly once.
- `output` takes an AI SDK `Output` (e.g. `Output.object({ schema })`): a completed run's `output` is then the parsed value instead of the text, and a final answer that does not parse fails the run with `validation_error`. An answer cut off at the output token limit, or a loop that ended on a tool call nothing executed, fails it with `incomplete_response`.
- The engine streams every model call: `engine.on('run.delta', ({ delta }) => ...)` gets `{ runId, step, kind: 'text' | 'reasoning', text }` while the model writes. Deltas are never stored and reach only listeners in the process executing the run.

### Effect tools

```typescript
const agent = defineAgent({
    name: 'responder',
    model,
    instructions: 'Answer new issues.',
    tools: ({ run }) => {
        const keyOf = ({ issue }: { issue: number }) => `${run.runId}:comment:${issue}`;
        return {
            comment: defineEffectTool({
                inputSchema: z.object({ issue: z.number(), body: z.string() }),
                effectKey: keyOf,
                // finds a comment an earlier, crashed attempt already posted
                alreadyApplied: async (key, { issue }) => findComment(issue, effectMarker(key)),
                execute: async (input) => postComment(input.issue, `${input.body}\n${effectMarker(keyOf(input))}`),
            }),
        };
    },
});
```

- The effect key defaults to `${runId}:${toolName}:${sha256(input)}`; `effectKey` replaces it.
- On every call the engine tries the recorded result first, then `alreadyApplied`, then `execute`. The result is recorded after `execute` returns. A throwing `execute` records nothing, so a retry may apply it.
- `effectMarker(key)` is a hidden HTML comment to embed in what the tool creates, so that `alreadyApplied` can find it again.

### Approvals

```typescript
const deployer = defineAgent({
    name: 'deployer',
    model,
    instructions: 'Deploy the requested version.',
    tools: () => ({ deploy }),
    approvals: { deploy: 'user' },
    approvalTimeoutMs: 60 * 60 * 1000,
    notify: 'owner',
});

// fail fast: the engine rejects an empty secret, which would let anyone mint tokens
const resumeSecret = process.env.RESUME_SECRET;
if (!resumeSecret) throw new Error('RESUME_SECRET is not set');

const engine = new RunEngine({
    store,
    agents: [deployer],
    notifiers: { owner: notifier },
    resumeSecret,
});

// later, with the token the notifier delivered
await engine.resume(token, { approved: true });
```

- A call that needs approval puts the run in `waiting` and frees its slot. The notifier receives the request once, with a resume token signed with `resumeSecret`; a failed send is retried on every poll until it is delivered.
- A policy can also be a function that returns `'user'`, `'allow'` or `'deny'` per call.
- A token answers its wait point once. A forged, expired or superseded token throws `InvalidResumeTokenError`.
- An approval not answered within `approvalTimeoutMs` (default 24 hours) is denied, and the model sees the denial.

### Invokers and tool access

A run can carry its invoker: who started it, as an authenticator resolved it (`@chamberu/http` sets it from the request's principal). `toolPolicy` decides per tool whether the run may use it; a refused tool is not offered to the model.

```typescript
const ops = defineAgent({
    name: 'ops',
    model,
    instructions: 'Operate the service.',
    tools: () => ({ deploy, rollback }),
    // offers a tool only when the invoker holds tool:ops:<tool>; cron and webhook runs get none
    toolPolicy: requireToolPermission(),
    approvals: {
        // release managers deploy without asking
        deploy: (_input, { runtimeContext }) => {
            const invoker = runtimeContext.trigger.invoker;
            return invoker && hasPermission(invoker.permissions, 'release:manage') ? 'allow' : 'user';
        },
    },
});

await engine.dispatch({
    agent: 'ops',
    trigger: 'http',
    source: 'http',
    payload: {},
    invoker: { id: 'u-42', kind: 'user', permissions: ['tool:ops:deploy'] },
});

// the approver is recorded on the run's wait step
await engine.resume(token, { approved: true, approver: { id: 'u-7', kind: 'user', permissions: [] } });
```

- The invoker (`{ id, kind, name?, permissions }`) is a snapshot taken at dispatch. A run keeps it across approvals and restarts; revoking a grant later does not reach a run that already holds it.
- With an invoker, the `idempotencyKey` is scoped to it (`<agent>:<source>:<kind>:<id>`): only the same invoker's retry is deduplicated, another invoker with the same key gets its own run.
- Tool code sees it as `run.trigger.invoker` in the tool factory and `ctx.trigger.invoker` in effect hooks; approval policies see it as `runtimeContext.trigger.invoker`.
- The policy covers state tools too. A call to a refused tool that still arrives fails as a tool error and the run goes on: the step records it as `tool_not_allowed` (`ToolNotAllowedError`), whether the model called it anyway (the model sees the AI SDK's unavailable-tool error) or an approved call from an older history reached the engine's re-check.
- Permissions are `:`-separated: `*` alone grants everything, a `*` segment matches one segment, and segment counts must match. `requireToolPermission({ withoutInvoker: 'allow' })` lets runs without an invoker use every tool.

### Agent state

```typescript
const digest = defineAgent({
    name: 'digest',
    model,
    instructions: 'Track open loops across days.',
    state: { loops: z.object({ title: z.string(), due: z.string().optional() }) },
    tools: ({ state }) => ({
        countLoops: tool({
            inputSchema: z.object({}),
            execute: async () => (await state.collection('loops').list()).length,
        }),
    }),
});
```

- `state.get` and `state.set` are a key-value store per agent. Each declared collection holds documents, validated by its Standard Schema on upsert.
- The model also gets each collection as `state_<collection>_list`, `state_<collection>_upsert` and `state_<collection>_remove` tools; upsert and remove are effect tools.

### Stores

`MemoryStore` keeps everything in process memory, for development and tests. A store implements the `IStore` interface (runs, steps, checkpoints, idempotency keys, locks, effects, state, artifacts) and proves it with the shared contract suite from [`@chamberu/test-kit`](../test-kit):

```typescript
import { describeStoreContract } from '@chamberu/test-kit';

describeStoreContract((clock) => new MemoryStore({ clock }));
```

The factory receives a `ControllableClock` and must use it for every expiry decision. The suite runs on Vitest.

## Options

`new RunEngine(options)`:

| Option | Type | Default | Description |
|---|---|---|---|
| `store` | `IStore` | required | Where runs, steps, checkpoints and state live |
| `agents` | `Agent[]` | required | The agents this engine runs |
| `resumeSecret` | `string` | required | HMAC secret for resume tokens and AI SDK approval signatures; must not be empty |
| `notifiers` | `Record<string, INotifier>` | `{}` | Notifiers by name, referenced by an agent's `notify` |
| `maxConcurrentRuns` | `number` | `4` | Runs executing at once in this process |
| `claimTtlMs` | `number` | `60_000` | Lease on a running run, renewed every `claimTtlMs / 3`; the poll for new work, expired approvals and abandoned runs uses the same interval |
| `owner` | `string` | `` `${hostname}-${pid}` `` | Identity of this replica in claims |
| `clock` | `IClock` | `systemClock` | Time source, replaceable in tests |
| `onError` | `(error, run?) => void` | `console.error` | Errors with no caller to throw to, such as a lost lease |

`defineAgent(definition)`:

| Field | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | required | Unique per app, lowercase words joined by `-` |
| `model` | `LanguageModel` | required | Any AI SDK model |
| `instructions` | `string` | required | System instructions |
| `triggers` | `TriggerDefinition[]` | none | From `cron()`, `http()` and `webhook()` |
| `tools` | `(ctx) => ToolSet` | none | Tool factory, called for each execution |
| `state` | `Record<string, StandardSchemaV1>` | none | Typed state collections |
| `toolPolicy` | `(toolName, { run }) => boolean` | none | Tools the run may use, e.g. `requireToolPermission()` |
| `budget` | `{ maxSteps, maxTokens?, timeoutMs? }` | `{ maxSteps: 20, timeoutMs: 900_000 }` | Per run; the timeout applies to each execution |
| `approvals` | `Record<string, ApprovalPolicy>` | none | Tools that need approval: `'user'` or a function |
| `approvalTimeoutMs` | `number` | `86_400_000` | After this, the approval is denied |
| `notify` | `string` | none | Name of a notifier registered on the engine |
| `output` | `Output` | none | AI SDK structured output; a completed run's `output` is the parsed value |

## API

| Export | Kind | Purpose |
|---|---|---|
| `defineAgent` | function | Validates an agent definition and applies defaults |
| `DEFAULT_MAX_STEPS`, `DEFAULT_TIMEOUT_MS` | constant | The default budget: `20` steps, `900_000` ms |
| `cron`, `http`, `webhook` | function | Trigger definitions |
| `RunEngine` | class | `start`, `dispatch`, `getRun`, `on`, `resume`, `cancel`, `recover`, `tick`, `idle`, `stop`, `drain` |
| `MemoryStore` | class | In-memory `IStore` |
| `defineEffectTool`, `effectMarker` | function | Recorded side-effecting tools and their hidden marker |
| `EFFECT` | symbol | Marks a tool created by `defineEffectTool()` |
| `wrapToolsForRun` | function | Applies effect recording to a `ToolSet` outside the engine; an optional `allow(toolName)` re-checks each call (a refused call throws `ToolNotAllowedError`) |
| `createResumeToken`, `verifyResumeToken` | function | Sign and check resume tokens |
| `createAgentState`, `createStateTools` | function | State API and generated state tools over a store |
| `hasPermission`, `matchesPermission`, `toolPermission` | function | Permission matching and the `tool:<agent>:<tool>` permission |
| `requireToolPermission` | function | A `toolPolicy` that checks the invoker's permissions |
| `ChamberuError` | class | Base class of every error below |
| `InvalidAgentDefinitionError`, `InvalidResumeTokenError`, `InvalidRunStateError`, `RunNotFoundError`, `ArtifactNotFoundError` | class | Rejections of definitions and engine calls |
| `BudgetExceededError`, `FatalToolError`, `IncompleteResponseError`, `LeaseLostError`, `TimeoutError`, `ValidationError` | class | Run failures and reported conditions; `ValidationError.issues` holds the validup issues |
| `ToolNotAllowedError` | class | The tool error recorded for a call to a tool the `toolPolicy` refuses |
| `ErrorCode` | object | The `code` of every error above |
| `systemClock` | object | The default `IClock` |

Types: `Agent`, `AgentDefinition`, `ToolPolicy`, `TriggerDefinition`, `TriggerEnvelope`, `Invoker`, `Run`, `RunStatus`, `Step`, `Checkpoint`, `WaitPoint`, `Budget`, `Usage`, `IStore` and its parts, `Artifact`, `ArtifactInput`, `IRunArtifacts`, `INotifier`, `Notification`, `IAgentState`, `RunEvent`, `RunEngineOptions`, `IClock`.

Test helpers (`ControllableClock`, `describeStoreContract`) live in [`@chamberu/test-kit`](../test-kit).

## Notes

- **A tool error does not fail the run.** It goes back to the model as a tool error result. Throw `FatalToolError` to fail the run; the step budget caps retry loops.
- **Budgets settle runs.** A run stopped by `maxSteps` or `maxTokens` while the model still wanted to call tools fails with code `BudgetExceeded`; a run that hits its timeout fails with code `Timeout`.
- **Effects are recorded after they happen.** A crash between a tool's side effect and the store write repeats the effect on resume, unless `alreadyApplied` finds it.
- **Several approvals in one step are handled one at a time.** The run waits on the first; the other calls are dropped from the history, and the model requests them again after the resume.
- **`MemoryStore` is not durable.** Everything is gone with the process; use a persistent store to survive restarts or to run replicas.
- **`stop()` only stops polling.** Runs in progress continue; use `drain()` to shut down.

## License

Published under [Apache License 2.0](./LICENSE).
