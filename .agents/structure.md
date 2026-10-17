# Project Structure

## Directory Layout

```
chamberu/
├── packages/
│   ├── core/                        # @chamberu/core
│   │   ├── src/                     # Library source (entry: src/index.ts), one folder per module
│   │   ├── test/
│   │   │   ├── vitest.config.ts     # Aliases @chamberu/core to ../src/index.ts
│   │   │   ├── unit/                # *.spec.ts, one folder per src module (agent/, engine/, ...)
│   │   │   ├── fixtures/            # readme-example.ts (the README example, run as a test)
│   │   │   └── utils/               # mock-model.ts, clock.ts (private ControllableClock copy)
│   │   ├── README.md                # Package README (must contain the fixture verbatim)
│   │   ├── tsdown.config.ts         # Builds dist/index.mjs + .d.mts
│   │   ├── tsconfig.json            # src + test (typecheck)
│   │   └── tsconfig.build.json      # src only (build:types)
│   ├── test-kit/                    # @chamberu/test-kit (same layout; aliases core and itself to src)
│   └── docs/                        # @chamberu/docs (private, not released): VitePress site (npm run docs:dev / docs:build)
│       ├── src/.vitepress/          # config.mts, theme/ (default theme)
│       ├── src/public/              # logo.svg (favicon), run-lifecycle.svg
│       └── src/snippets/            # Code samples included via <<<, type-checked by the docs typecheck
├── .github/
│   ├── assets/                      # logo.svg (+ test-kit and organisation variants), run-lifecycle.svg
│   ├── actions/{install,build}/     # Composite actions
│   ├── workflows/{ci,release,docs}.yml # CI (Node 22, 24), release-please + npm publish, docs to GitHub Pages
│   ├── ISSUE_TEMPLATE/              # Bug report and feature request templates
│   ├── FUNDING.yml                  # GitHub Sponsors
│   └── dependabot.yml               # Daily npm + github-actions updates
├── .husky/commit-msg                # Runs commitlint
├── CONTRIBUTING.md, SECURITY.md, CODE_OF_CONDUCT.md
├── nx.json                          # Task orchestration and caching
├── tsconfig.json                    # Root config, path aliases @chamberu/core and @chamberu/test-kit -> packages/*/src
├── tsconfig.build.json              # Shared compiler options
├── eslint.config.js                 # @tada5hi/eslint-config flat config
├── commitlint.config.mjs            # Conventional Commits
├── release-please-config.json       # Per-package release config
└── .release-please-manifest.json    # Current released versions
```

## Packages

| Package | Status | Responsibility |
|---------|--------|----------------|
| `@chamberu/core` | Exists (0.1.0) | defineAgent, run engine, checkpoints, trigger model, state API, budgets, IStore/INotifier interfaces, in-memory store |
| `@chamberu/test-kit` | Exists (0.1.0) | `ControllableClock`, `describeStoreContract()`; depends on core, core never depends on it |
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

## Core Module Map (`packages/core/src`)

Every module is a folder with `module.ts`, `types.ts`, `helpers.ts`, `constants.ts` and an `index.ts` barrel as needed (see [conventions](conventions.md#file-organization)).

| Path | Purpose |
|------|---------|
| `errors/` | `ChamberuError` (`base.ts`), one file per subclass, `ErrorCode` (`constants.ts`) |
| `agent/` | `defineAgent()`, `AgentDefinition`, name rules and budget defaults (`constants.ts`) |
| `trigger/` | `TriggerDefinition`, `TriggerEnvelope` (`types.ts`); `cron/`, `http/`, `manual/` each hold their factory (`module.ts`) and options type (`types.ts`) |
| `run/` | `RunStatus` enum (`constants.ts`); `Run`, `RunStatusLiteral`, `Step`, `Checkpoint`, `WaitPoint`, `Budget`, `Usage` |
| `store/types.ts` | `IStore` and its parts (see architecture) |
| `store/memory/` | `MemoryStore` |
| `engine/` | `RunEngine` (`module.ts`), `budget.ts` (stop conditions), `queue/` (scheduler), `execute/` (one execution) |
| `effect/` | `defineEffectTool()`, `effectMarker()` (`define.ts`), `wrapToolsForRun()` (`wrap.ts`), `EFFECT` |
| `approval/` | Signed resume tokens |
| `notify/types.ts` | `INotifier`, `Notification` |
| `state/` | `createAgentState()` (`module.ts`, validation via `@validup/standard-schema`), generated tools (`tools.ts`) |
| `clock/` | `IClock`, `systemClock` |

`src/index.ts` re-exports each folder's `index.ts`. `@chamberu/test-kit` (`packages/test-kit/src`) holds `clock/` (`ControllableClock`) and `store-contract/` (`describeStoreContract`).
