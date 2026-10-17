# Agents

An agent is a typed config object passed to `defineAgent()`. It names a model, its instructions, the triggers that may start it, a tool factory, a budget, approval policies, typed state and a notifier.

<<< @/snippets/agents.ts#define

## What `defineAgent()` checks

`defineAgent()` validates the definition and returns `{ name, definition }` with defaults applied. It throws `InvalidAgentDefinitionError` when:

- the name does not match `^[a-z0-9]+(-[a-z0-9]+)*$` (lowercase words joined by single hyphens), or is longer than 64 characters,
- two triggers of the agent share an id.

The engine checks the rest when you construct it: agent names must be unique within one `RunEngine`, and every `notify` must name a notifier registered on the engine.

<<< @/snippets/agents.ts#defaults

## Fields

| Field | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | required | Unique per engine, lowercase words joined by `-`, at most 64 characters |
| `model` | `LanguageModel` | required | Any AI SDK model |
| `instructions` | `string` | required | System instructions |
| `triggers` | `TriggerDefinition[]` | none | From `cron()`, `http()` and `manual()`. See [Triggers](/guide/triggers) |
| `tools` | `(ctx) => ToolSet` | none | Tool factory, called for each execution |
| `state` | `Record<string, StandardSchemaV1>` | none | Typed state collections. See [Agent State](/guide/state) |
| `budget` | `Partial<Budget>` | `{ maxSteps: 20, timeoutMs: 900_000 }` | See [Budgets & Timeouts](/guide/budgets) |
| `approvals` | `Record<string, ApprovalPolicy>` | none | Tools that need approval. See [Approvals](/guide/approvals) |
| `approvalTimeoutMs` | `number` | `86_400_000` (24 h) | After this, a pending approval is denied |
| `notify` | `string` | none | Name of a notifier registered on the engine |

The budget you pass is merged over the defaults, so `budget: { maxSteps: 5 }` keeps the 15 minute timeout.

## The tools factory

`tools` is a function, not a `ToolSet`. The engine calls it once per execution with:

| Field | Type | Description |
|---|---|---|
| `state` | `AgentState` | The agent's [state](/guide/state), typed by its `state` schema |
| `run.runId` | `string` | Id of the run being executed |
| `run.agent` | `string` | Agent name |
| `run.trigger` | `TriggerEnvelope` | The envelope that started the run |
| `run.signal` | `AbortSignal` | Aborts on cancel, drain, a lost lease or the run timeout |

A factory lets tools close over per-run data, such as the run id in an [effect key](/guide/effect-tools) or the repository named in the payload. Pass `run.signal` on to `fetch` and other cancellable work.

The returned tools are plain AI SDK tools. When the agent declares `state`, the engine adds generated state tools; your tools win on a name clash. Every [effect tool](/guide/effect-tools) is then wrapped so it applies at most once per effect key.

## Many agents per engine

One engine runs any number of agents. They share the store, the concurrency limit and the notifiers:

<<< @/snippets/engine.ts#many

`dispatch()` names the agent per run. An unknown agent name throws `InvalidAgentDefinitionError`.
