<p align="center">
    <img src="./.github/assets/logo.svg" alt="chamvi" width="128" height="128" />
</p>

<h1 align="center">chamvi</h1>

<p align="center">
    <b>Self-hosted, trigger-driven AI agents with durable runs, built on the Vercel AI SDK.</b><br>
    You write the agent with the AI SDK. chamvi queues its runs, checkpoints every step,<br>
    pauses for approvals and resumes interrupted runs, in your own Node process and database.
</p>

<p align="center">
    <a href="https://www.npmjs.com/package/@chamvi/core"><img src="https://img.shields.io/npm/v/@chamvi/core" alt="npm version" /></a>
    <a href="https://github.com/chamvi/chamvi/actions/workflows/ci.yml"><img src="https://github.com/chamvi/chamvi/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="https://github.com/chamvi/chamvi/blob/master/LICENSE"><img src="https://img.shields.io/github/license/chamvi/chamvi" alt="License" /></a>
</p>

<p align="center">
    <a href="#why-chamvi"><b>Why chamvi?</b></a>
    ·
    <a href="#packages">Packages</a>
    ·
    <a href="#quick-start">Quick start</a>
    ·
    <a href="#development">Development</a>
</p>

---

> chamvi is at an early stage. The engine, HTTP, scheduler, TypeORM store, GitHub, sandbox, coding and dashboard packages exist; the notifiers and the CLI are planned.

## Why chamvi?

The AI SDK runs a model and its tool loop, and stops there. An agent that reacts to webhooks and schedules also needs a queue, a way to survive a restart halfway through a run, a guard against posting the same comment twice after a retry, and a way to wait a day for a human to approve a call. That usually means a hosted orchestrator, or a lot of glue code.

chamvi is that layer as a library, with no orchestrator server and no Redis:

| Concern | AI SDK on its own | chamvi |
|---|---|---|
| **Intake** | You call `generateText` from your handler | `dispatch()` stores a `queued` run; an `idempotencyKey` turns a redelivery into the existing run |
| **Concurrency** | Two webhooks for the same issue race each other | One run at a time per `concurrencyKey`, enforced through the store across replicas |
| **Durability** | A crash loses the conversation | A checkpoint after every step; a recovered run continues from the latest one |
| **Side effects** | A retried tool call posts again | `defineEffectTool()` records each result per effect key and can check the remote system before acting |
| **Approvals** | You build the pause, the storage and the callback | The run waits in `waiting` with a signed resume token; `resume(token, decision)` continues it |
| **Limits** | `stopWhen` per call | `maxSteps`, `maxTokens` and `timeoutMs` per run, settled as `completed` or `failed` |
| **Shutdown** | Runs die with the process | `drain()` waits for in-flight runs, then marks the rest `interrupted` for another replica |
| **Running code** | Model-written commands run wherever your process runs | `create_workspace` gives the run a disposable container or pod with the repository checked out; the coding tools work inside it, and it is removed when the run settles |

Models, messages and tools stay AI SDK types: `defineAgent()` takes a `LanguageModel` and plain AI SDK tools (`tool()`, or `defineTool()` for tools that read the run context), and nothing is wrapped in a chamvi type.

<p align="center">
    <img src="./.github/assets/run-lifecycle.svg" alt="dispatch() stores a queued run, deduplicated by idempotency key. The engine claims it and runs it: every LLM or tool step is followed by a checkpoint in the store. A run ends completed, failed or cancelled. A tool call that needs approval pauses the run in waiting with a signed resume token; approving or denying it requeues the run. drain() or a crashed process leaves a run interrupted or with an expired claim; recover() requeues it, and the next execution continues from the latest checkpoint." width="100%" />
</p>

A run moves from `queued` to `running` and settles `completed`, `failed` or `cancelled`. An approval parks it in `waiting` until `resume()` requeues it; `drain()` or a crash leaves it `interrupted` (or with a lapsed claim) until `recover()` requeues it. Every requeued run continues from its latest checkpoint.

### Compared with other durable runtimes

Other tools also make agent runs durable. They differ in where the runs live and in how much of the agent-specific work (tool side effects, approvals, who may call which tool) they take off your hands. As of October 2026, going by each project's own docs:

| | chamvi | [Workflow DevKit][wf] + `WorkflowAgent` | [Mastra][mastra] | [Inngest][inngest] | [Trigger.dev][trigger] |
|---|---|---|---|---|---|
| **Runs in** | Your Node process, one PostgreSQL database | Your process with the Postgres World (a reference implementation), or Vercel | Your process or a Mastra server, with a storage adapter | The Inngest server, which calls your app's endpoint | The Trigger.dev platform (cloud, or self-hosted with Postgres, Redis, ClickHouse and more) |
| **Checkpoint per LLM and tool step** | Yes | LLM calls; tools only when marked `"use step"` | Durable agents (beta) resume from a snapshot, per step only when enabled | Yes, with `step.ai` | No, a retry restarts the task; waits are snapshotted |
| **Tool side effects after a crash** | Recorded per effect key, `alreadyApplied` checks the remote system | Completed steps memoized; pass `stepId` to the API | May run twice, unless on the Inngest runner | Completed steps memoized; pass a stable key | Repeat in the parent task; child tasks deduped |
| **Approval that waits for days** | Signed, expiring resume token; approver needs `agent:<name>:approve` | Hook tokens, which are not credentials; your route authorizes | Resume by `runId` and `toolCallId` | `waitForEvent` with a timeout | Wait tokens |
| **Deduplicated intake** | Per agent, source and caller, 7 days | A pattern you build with hooks | Not documented | Yes, 24 hours | Yes, 30 days by default |
| **One run at a time per key** | `concurrencyKey` | Not documented | Not documented | `concurrency.key` | `concurrencyKey` |
| **Cron across replicas** | Once per tick, overlap `skip`, `queue-one` or `allow` | No cron | Yes, overlap not documented | Yes, overlap through concurrency settings | Yes, no skip-if-running policy |
| **Agents as an MCP server** | `/mcp`, one `run_<agent>` tool per agent | No | `MCPServer` | No | No (its MCP server is developer tooling) |
| **Tools restricted per caller** | `requireToolPermission()` reads the run's invoker | No | Tool-level checks are Enterprise | No | No |
| **License** | Apache-2.0 | Apache-2.0 | Apache-2.0, `ee/` source-available | Server SSPL (delayed Apache-2.0) | Apache-2.0 |

Pick one of the others when you want what chamvi does not have yet: a hosted service, a hosted run dashboard, or Mastra's memory, RAG and evals. Pick chamvi when the agent lives next to your app and its database, and when a webhook that fires twice must not post twice.

[wf]: https://workflow-sdk.dev/docs/ai/human-in-the-loop
[mastra]: https://mastra.ai/docs/long-running-agents/durable-agents
[inngest]: https://www.inngest.com/docs/self-hosting
[trigger]: https://trigger.dev/docs/how-it-works

## Packages

| Package | Version | Description |
|---|---|---|
| [`@chamvi/core`](./packages/core) | [![npm](https://img.shields.io/npm/v/@chamvi/core)](https://www.npmjs.com/package/@chamvi/core) | Agents, triggers, the run engine, checkpoints, effect tools, approvals, agent state and the in-memory store |
| [`@chamvi/http`](./packages/http) | [![npm](https://img.shields.io/npm/v/@chamvi/http)](https://www.npmjs.com/package/@chamvi/http) | REST, server-sent events, webhooks and an MCP endpoint over the run engine, with bearer, authup and OIDC authentication |
| [`@chamvi/scheduler`](./packages/scheduler) | [![npm](https://img.shields.io/npm/v/@chamvi/scheduler)](https://www.npmjs.com/package/@chamvi/scheduler) | Fires `cron()` triggers once per tick across replicas, with overlap policies, timezones and one-shot jobs |
| [`@chamvi/store-typeorm`](./packages/store-typeorm) | [![npm](https://img.shields.io/npm/v/@chamvi/store-typeorm)](https://www.npmjs.com/package/@chamvi/store-typeorm) | TypeORM store (PostgreSQL): durable runs, leases and agent state across replicas |
| [`@chamvi/github`](./packages/github) | [![npm](https://img.shields.io/npm/v/@chamvi/github)](https://www.npmjs.com/package/@chamvi/github) | GitHub App authentication, verified webhook triggers deduplicated by delivery id, and issue, label, comment and search tools |
| [`@chamvi/sandbox`](./packages/sandbox) | [![npm](https://img.shields.io/npm/v/@chamvi/sandbox)](https://www.npmjs.com/package/@chamvi/sandbox) | Sandbox contracts and the workspace manager: one workspace per run and repository, `create_workspace` / `dispose_workspace` tools, cleanup when the run settles |
| [`@chamvi/sandbox-local`](./packages/sandbox-local) | [![npm](https://img.shields.io/npm/v/@chamvi/sandbox-local)](https://www.npmjs.com/package/@chamvi/sandbox-local) | Workspaces in a temporary directory, for development and tests (no isolation) |
| [`@chamvi/sandbox-docker`](./packages/sandbox-docker) | [![npm](https://img.shields.io/npm/v/@chamvi/sandbox-docker)](https://www.npmjs.com/package/@chamvi/sandbox-docker) | One hardened container per workspace: non-root, read-only root, no capabilities, resource limits |
| [`@chamvi/sandbox-k8s`](./packages/sandbox-k8s) | [![npm](https://img.shields.io/npm/v/@chamvi/sandbox-k8s)](https://www.npmjs.com/package/@chamvi/sandbox-k8s) | One hardened pod per workspace, without a service account token |
| [`@chamvi/coding`](./packages/coding) | [![npm](https://img.shields.io/npm/v/@chamvi/coding)](https://www.npmjs.com/package/@chamvi/coding) | `read_file`, `write_file`, `edit_file`, `grep`, `list_files`, `bash` and `git_diff` inside a workspace |
| [`@chamvi/ui`](./packages/ui) | [![npm](https://img.shields.io/npm/v/@chamvi/ui)](https://www.npmjs.com/package/@chamvi/ui) | The dashboard: runs with live steps, an approvals inbox, agent state and schedules, served by `uiRoutes()` |
| [`@chamvi/test-kit`](./packages/test-kit) | [![npm](https://img.shields.io/npm/v/@chamvi/test-kit)](https://www.npmjs.com/package/@chamvi/test-kit) | `ControllableClock`, the store and workspace contract suites, and a git fixture |

## Quick start

```bash
npm install @chamvi/core ai @ai-sdk/anthropic zod --save
```

ESM only, Node.js `>=22`. `ai@^7` is a peer dependency; use the provider package of your model.

```typescript
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import {
    MemoryStore,
    Engine,
    defineAgent,
    defineEffectTool,
    http,
} from '@chamvi/core';

const triage = defineAgent({
    name: 'triage',
    model: anthropic('claude-sonnet-5-5'),
    instructions: 'Label the issue in the trigger payload as bug, feature or question.',
    triggers: [http()],
    tools: {
        // recorded per (run, tool, input): a recovered run reuses the result
        addLabel: defineEffectTool({
            description: 'Adds a label to the issue.',
            inputSchema: z.object({ label: z.enum(['bug', 'feature', 'question']) }),
            execute: async ({ label }) => ({ added: label }),
        }),
    },
});

const engine = new Engine({
    store: new MemoryStore(),
    agents: [triage],
    resumeSecret: process.env.RESUME_SECRET ?? 'change-me',
});
await engine.start();

const { runId } = await engine.dispatch({
    agent: 'triage',
    trigger: 'http',
    source: 'http',
    payload: { title: 'App crashes on start' },
});

await engine.idle();
console.log(await engine.getRun(runId)); // status: 'completed', output: the model's last answer

await engine.drain();
```

`MemoryStore` keeps everything in process memory; it is for development and tests. Effect tools, approvals, agent state, budgets and the full option reference are in the [`@chamvi/core` README](./packages/core#readme).

### Give the agent a workspace

```bash
npm install @chamvi/sandbox @chamvi/sandbox-docker @chamvi/coding --save
```

```typescript
import { codingTools } from '@chamvi/coding';
import { createWorkspaceManager } from '@chamvi/sandbox';
import { createDockerSandbox } from '@chamvi/sandbox-docker';

const workspaces = createWorkspaceManager({
    // one container per workspace from ghcr.io/chamvi/sandbox-node:24
    provider: createDockerSandbox(),
    // the model can only clone your own repositories
    allowRepo: (url) => url.startsWith('https://github.com/acme/'),
});

const repro = defineAgent({
    name: 'repro',
    model: anthropic('claude-sonnet-5-5'),
    instructions: 'Check out the repository from the payload, write a failing test for the reported bug ' +
        'and answer with the output and the diff.',
    triggers: [http()],
    tools: { ...workspaces.tools(), ...codingTools(workspaces) },
    // every shell command waits for a human
    approvals: { bash: 'user' },
});

// add repro to the Engine's agents, then: a run's workspaces go once it settled
workspaces.attach(engine);
// on shutdown, after engine.drain()
await workspaces.close();
```

`createLocalSandbox()` from `@chamvi/sandbox-local` runs workspaces in a temporary directory for development; `createKubernetesSandbox({ namespace })` from `@chamvi/sandbox-k8s` runs one pod per workspace. Limits, the image and the hardening are in the [`@chamvi/sandbox` README](./packages/sandbox#readme).

## Development

```bash
npm install
npm run build
npm run test
npm run typecheck
npm run lint
```

The packages live in `packages/*`, built with tsdown and orchestrated by nx. Commits follow Conventional Commits; release-please versions each package.

## Contributing

Before starting to work on a pull request, it is important to review the guidelines for
[contributing](./CONTRIBUTING.md) and the [code of conduct](./CODE_OF_CONDUCT.md).
These guidelines will help to ensure that contributions are made effectively and are accepted.

## License

Made with 💚

Published under [Apache License 2.0](./LICENSE).
