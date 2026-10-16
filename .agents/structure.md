# Project Structure

## Directory Layout

```
chamberu/
├── packages/
│   └── core/                        # @chamberu/core
│       ├── src/                     # Library source (entry: src/index.ts)
│       ├── test/
│       │   ├── vitest.config.ts     # Aliases @chamberu/core to ../src/index.ts
│       │   ├── unit/                # *.spec.ts files
│       │   ├── fixtures/            # readme-example.ts (the README example, run as a test)
│       │   └── utils/               # mock-model.ts
│       ├── tsdown.config.ts         # Builds dist/index.mjs + dist/index.d.mts
│       ├── tsconfig.json            # src + test (typecheck)
│       └── tsconfig.build.json      # src only (build:types)
├── .github/
│   ├── assets/                      # README diagrams (theme-aware SVGs)
│   ├── actions/{install,build}/     # Composite actions
│   └── workflows/{ci,release}.yml   # CI (Node 22, 24) and release-please + npm publish
├── nx.json                          # Task orchestration and caching
├── tsconfig.json                    # Root config, path alias @chamberu/core -> packages/core/src/index.ts
├── tsconfig.build.json              # Shared compiler options
├── eslint.config.js                 # @tada5hi/eslint-config flat config
├── commitlint.config.mjs            # Conventional Commits
├── release-please-config.json       # Per-package release config
└── .release-please-manifest.json    # Current released versions
```

## Packages

| Package | Status | Responsibility |
|---------|--------|----------------|
| `@chamberu/core` | Exists (0.1.0) | defineAgent, run engine, checkpoints, trigger model, state API, budgets, Store/Notifier interfaces, in-memory store |
| `@chamberu/http` | Planned | REST control API, webhook ingestion, SSE, MCP endpoint, auth |
| `@chamberu/scheduler` | Planned | hubwire integration: cron triggers, lock wiring |
| `@chamberu/store-typeorm` | Planned | Postgres store (TypeORM entities and migrations) |
| `@chamberu/sandbox-local`, `@chamberu/sandbox-k8s` | Planned | Workspaces for clone/exec/artifacts |
| `@chamberu/coding`, `@chamberu/coding-claude-code` | Planned | Coding tools and Claude Code backend |
| `@chamberu/github` | Planned | GitHub App auth, webhooks, tools |
| `@chamberu/notify-openclaw`, `@chamberu/notify-github` | Planned | Notifiers |
| `@chamberu/ui` | Planned | Vue 3 dashboard |
| `chamberu` | Planned | Umbrella package and CLI |

The memory store lives inside `@chamberu/core` (no separate `store-memory` package), because every test needs it.

## Core Module Map (target layout of `packages/core/src`)

| Path | Purpose |
|------|---------|
| `errors.ts` | `ChamberuError` subclasses (ebec) |
| `agent/{types,define}.ts` | `AgentDefinition`, `defineAgent()` |
| `trigger/{types,builders}.ts` | `TriggerDefinition`, `TriggerEnvelope`, `cron()`, `http()`, `manual()` |
| `run/types.ts` | `Run`, `RunStatus`, `Step`, `Checkpoint`, `WaitPoint`, `Budget`, `Usage` |
| `store/types.ts` | Store interfaces (see architecture) |
| `store/memory.ts` | `MemoryStore` |
| `store/contract.ts` | `describeStoreContract()`, exported via `@chamberu/core/testing` |
| `engine/{engine,queue,execute,budget}.ts` | `RunEngine`, scheduler, one execution, stop conditions |
| `effect/{define,wrap}.ts` | `defineEffectTool()`, `wrapToolsForRun()` |
| `approval/token.ts` | Signed resume tokens |
| `notify/types.ts` | `Notifier`, `Notification` |
| `state/{api,tools}.ts` | Agent state API and generated tools |
| `clock.ts` | Injectable `Clock` for tests |

`testing.ts` is the `@chamberu/core/testing` entry (`describeStoreContract`, `ControllableClock`).
