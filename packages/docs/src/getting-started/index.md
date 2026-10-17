# Introduction

chamberu is a TypeScript framework for **self-hosted, trigger-driven AI agents**. You write agents in your own repository, build them into a Docker image and run them on your own infrastructure. A webhook, a schedule or a manual call starts a run, and the run survives restarts, retries and approval pauses.

The LLM side is the [Vercel AI SDK](https://ai-sdk.dev) v7. chamberu adds what the AI SDK leaves out on purpose: triggers, a run queue, persistence, concurrency control, approvals and a graceful shutdown.

::: info Status
chamberu is pre-1.0. [`@chamberu/core`](/reference/), its test helpers in [`@chamberu/test-kit`](/reference/test-kit) and the [Postgres store](/stores/typeorm) exist today. The scheduler, the HTTP API, the GitHub connector, the UI and the deploy kit are planned; the [roadmap](/roadmap) lists them. Pages about planned work carry a <Badge type="warning" text="Planned" /> badge.
:::

## Why chamberu?

The AI SDK runs the model and its tool loop, and stops there. An agent that reacts to webhooks and schedules also needs:

- a place to queue the work,
- a way to survive a pod restart halfway through a run,
- a guard against posting the same comment twice after a retry,
- a way to wait a day for a human to approve a tool call.

That usually means a hosted orchestrator, or a lot of glue code. chamberu is that layer as a library.

| Concern | AI SDK on its own | With `@chamberu/core` |
|---|---|---|
| **Intake** | You call `generateText` from your handler | `dispatch()` stores a `queued` run; an `idempotencyKey` turns a redelivery into the existing run |
| **Concurrency** | Two webhooks for the same issue race each other | One run at a time per `concurrencyKey`, enforced through the store across replicas |
| **Durability** | A crash loses the conversation | A checkpoint after every step; a recovered run continues from the latest one |
| **Side effects** | A retried tool call posts again | `defineEffectTool()` records each result per effect key and can check the remote system first |
| **Approvals** | You build the pause, the storage and the callback | The run waits in `waiting` with a signed resume token; `resume(token, decision)` continues it |
| **Limits** | `stopWhen` per call | `maxSteps`, `maxTokens` and `timeoutMs` per run, settled as `completed` or `failed` |
| **Shutdown** | Runs die with the process | `drain()` waits for in-flight runs, then marks the rest `interrupted` for another replica |

## Design principles

- **Triggers first.** Every run starts from one normalized [trigger envelope](/guide/triggers). Deduplication and concurrency are decided at intake, before any model call.
- **Self-hosted.** Agents run in your process, on your cluster, with your provider keys. Nothing phones home and there is no paid console.
- **No orchestrator server.** Runs, leases, locks and idempotency keys live in a [pluggable store](/stores/). Replicas coordinate through that store; Redis is never required.
- **Built on the AI SDK, not around it.** `LanguageModel`, `ModelMessage` and `ToolSet` pass through unchanged. If you know `tool()` and `ToolLoopAgent`, you know how to write a chamberu tool.
- **A small concept surface.** About ten concepts: App, Agent, Trigger, Run, Step, State, Tool, Workspace, Notifier, Store. The core ships Agent, Trigger, Run, Step, State, Tool, Notifier and Store.
- **No spam.** Retries and restarts must not repeat comments, pushes or notifications. That is what [effect tools](/guide/effect-tools) and notifier idempotency keys are for.

## How it compares

chamberu sits next to several good tools. The difference is mostly where the orchestration runs and who owns it.

| Tool | What it is | Where chamberu differs |
|---|---|---|
| **Inngest** | Event-driven durable functions with step memoization, run by the Inngest server (cloud or self-hosted) | No separate server: the engine is a library and the store is your database |
| **Trigger.dev** | A platform for background jobs and AI tasks, with its own workers and dashboard (cloud or self-hosted) | Runs in your own Node process; the deploy kit is a plain Docker image and Helm chart |
| **Mastra** | A TypeScript agent framework with its own agent, workflow and memory abstractions | Keeps AI SDK types as they are and focuses on triggers, durable runs and operations |
| **Cloudflare Agents** | Stateful agents on Durable Objects | Not tied to a vendor runtime: any Node 22+ host and any store that passes the contract |
| **Workflow SDK** (`workflow`, `@ai-sdk/workflow`) | Durable functions through `'use workflow'` and `'use step'` directives with deterministic replay, wired in through a bundler integration | Uses step checkpoints instead of replay, so plain code runs as written, without a compiler step |

Each of these is a better fit in some setups: if you already run Inngest or Trigger.dev, or deploy to Cloudflare or Vercel, use what fits that platform. chamberu targets one owner running their agents on their own cluster.

## What ships today

`@chamberu/core` contains:

- [`defineAgent()`](/guide/agents) and the trigger builders `cron()`, `http()` and `manual()`
- the [`RunEngine`](/reference/#runengine): dispatch, scheduling, execution, checkpoints, budgets, approvals, cancel, drain and recovery
- [effect tools](/guide/effect-tools) and [agent state](/guide/state)
- the [store contract](/stores/) and [`MemoryStore`](/stores/memory)
- the [`INotifier`](/guide/notifiers) interface

`@chamberu/test-kit` adds the store contract suite and a controllable clock for tests.

The engine starts runs only through `engine.dispatch()`. Firing cron triggers, receiving webhooks and serving an HTTP or MCP API belong to the planned [`@chamberu/scheduler` and `@chamberu/http`](/roadmap) packages.

## Next steps

- [Installation](/getting-started/installation): install the core and a model provider.
- [Quick Start](/getting-started/quick-start): define an agent and run it once.
- [Guide](/guide/): the concepts, one page each.
