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
│   ├── scheduler/                   # @chamberu/scheduler (same layout; aliases core, test-kit and itself to src)
│   ├── http/                        # @chamberu/http (same layout; aliases core, test-kit and itself to src)
│   ├── test-kit/                    # @chamberu/test-kit (same layout; aliases core and itself to src)
│   ├── store-typeorm/               # @chamberu/store-typeorm (same layout)
│   │   ├── src/{entities,migrations,schema,store}/
│   │   └── test/global-setup.ts     # Starts postgres:18-alpine via testcontainers for the suite
│   └── docs/                        # @chamberu/docs (private, not released): VitePress site (npm run docs:dev / docs:build)
│       ├── src/.vitepress/          # config.mts, theme/ (Tailwind v4 tokens, Layout.vue), components/{home,layout}/
│       ├── src/public/              # logo.svg (favicon), fixed light/dark logo and run-lifecycle copies
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
├── tsconfig.json                    # Root config, path aliases @chamberu/core, @chamberu/http, @chamberu/scheduler, @chamberu/store-typeorm and @chamberu/test-kit -> packages/*/src
├── tsconfig.build.json              # Shared compiler options
├── eslint.config.js                 # @tada5hi/eslint-config flat config
├── commitlint.config.mjs            # Conventional Commits
├── release-please-config.json       # Per-package release config
└── .release-please-manifest.json    # Current released versions
```

## Packages

| Package | Status | Responsibility |
|---------|--------|----------------|
| `@chamberu/core` | Exists (0.1.0) | defineAgent, run engine (streaming, structured output), checkpoints, trigger model, run artifacts, state API, budgets, IStore/INotifier interfaces, in-memory store |
| `@chamberu/test-kit` | Exists (0.1.0) | `ControllableClock`, `describeStoreContract()`; depends on core, core never depends on it |
| `@chamberu/http` | Exists (0.1.0) | `createHttpApp()` (routup v6): REST control API, SSE run stream, webhook intake, MCP endpoint, authenticators (static tokens, authup, oidc), health, metrics, `createShutdown()`; peer on core |
| `@chamberu/scheduler` | Exists (0.1.0) | `createScheduler()` (one locked hubwire component per cron trigger), `runJob()`; depends on `hubwire`, peer on core |
| `@chamberu/store-typeorm` | Exists (0.1.0) | `TypeormStore`, entities, initial migration, `migrateStore`, `purgeExpired` |
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
| `trigger/` | `TriggerDefinition`, `TriggerEnvelope`, `Invoker` (`types.ts`), `toInvoker()` validation (`helpers.ts`, internal); `cron/`, `http/`, `webhook/` each hold their factory (`module.ts`) and options type (`types.ts`) |
| `artifact/` | `Artifact`, `ArtifactInput`, `IRunArtifacts` (`types.ts`); `ARTIFACT_URI_PREFIX` (`constants.ts`, internal); `createRunArtifacts()` (`module.ts`); `assertArtifactInput()`, `toFilePart()`, `hydrateMessages()` (`helpers.ts`) |
| `run/` | `RunStatus` enum (`constants.ts`); `Run`, `RunStatusLiteral`, `Step`, `Checkpoint`, `WaitPoint`, `Budget`, `Usage` |
| `store/types.ts` | `IStore` and its parts (see architecture) |
| `store/memory/` | `MemoryStore` |
| `engine/` | `RunEngine` (`module.ts`), `RunEvent`, `RunDelta`, `DispatchEnvelope` (`types.ts`), `budget.ts` (stop conditions), `queue/` (scheduler), `execute/` (one streamed execution) |
| `effect/` | `defineEffectTool()`, `effectMarker()` (`define.ts`), `wrapToolsForRun()` (`wrap.ts`), `EFFECT` |
| `approval/` | Signed resume tokens |
| `notify/types.ts` | `INotifier`, `Notification` |
| `permission/` | `matchesPermission()`, `hasPermission()`, `toolPermission()` (`match.ts`), `requireToolPermission()` (`policy.ts`), `RequireToolPermissionOptions` (`types.ts`), `PERMISSION_ALL` (`constants.ts`, internal) |
| `state/` | `createAgentState()` (`module.ts`, validation via `@validup/standard-schema`), generated tools (`tools.ts`) |
| `clock/` | `IClock`, `systemClock` |

`src/index.ts` re-exports each folder's `index.ts`. `@chamberu/test-kit` (`packages/test-kit/src`) holds `clock/` (`ControllableClock`) and `store-contract/` (`describeStoreContract`).

## Scheduler Module Map (`packages/scheduler/src`)

| Path | Purpose |
|------|---------|
| `lock/` | `createStoreScheduleLock()`: hubwire `IScheduleLock` over core's `ILockStore` |
| `tick/` | `fireCronTrigger()` (overlap check, envelope, dispatch), `readCronOptions()`; overlap check in `helpers.ts` |
| `scheduler/` | `createScheduler()`, `SCHEDULE_LOCK_TTL_MS`; `buildComponentOptions()` (`helpers.ts`, internal) |
| `run-job/` | `runJob()`; `resolveCronTrigger()`, `isQueuedBehindApproval()` (`helpers.ts`), `SETTLING` (`constants.ts`), both internal |

## HTTP Module Map (`packages/http/src`)

Folders without an `index.ts` export nothing public; other modules import the file they need.

| Path | Purpose |
|------|---------|
| `app/` | `createHttpApp()` (`module.ts`), `HttpAppOptions` and the internal `HttpContext` (`types.ts`), defaults (`constants.ts`), `buildContext()` and the JSON error handler (`helpers.ts`) |
| `auth/` | `Principal`, `Authenticator` (`types.ts`), `Permission` (`constants.ts`), `hasPermission()`, `agentPermission()` (`module.ts`), `authenticate()`, `authorize()`, `readBearerToken()`, `toInvoker()` (`helpers.ts`, internal); `static-tokens/`, `authup/`, `oidc/` hold the built-in authenticators |
| `request/` | No barrel: `readJsonBody()`, `validateBody()`, `validatePayload()`, `decodeQuery()` (rapiq), `readIdempotencyHeader()` (`helpers.ts`); validup validators `isString()`, `isBoolean()`, `isDefined()`, `isArrayOf()`, `isMediaType()`, `isBase64()` (`validators.ts`) |
| `health/` | No barrel: `/healthz`, `/readyz` |
| `runs/` | Run and artifact routes (`module.ts`), `serializeRun()`, `serializeStep()`, `canReadRun()`, `loadReadableRun()`, `loadRunArtifact()`, `contentDisposition()`, `assertCanListRuns()`, `parseRunListQuery()`, `resolveResumeTarget()` (`helpers.ts`), `MAX_ATTACHMENTS` (`constants.ts`, internal), `RunView`, `InvokerView`, `RunListQuery` (`types.ts`); `stream/` holds `streamRun()` (SSE, incl. `delta`) |
| `hooks/` | No barrel: `POST /hooks/:agent<path>` |
| `agents/` | `/agents`, `/schedules` and state routes (`module.ts`), `AgentSummary`, `ScheduleSummary` (`types.ts`) |
| `mcp/` | `createMcpEndpoint()`, `registerMcpRoutes()` (`module.ts`), the tools (`tools.ts`), `waitForRun()`, `toJsonSchema()` (`helpers.ts`), `RunSummary`, `RunToolResult` (`types.ts`) |
| `plugins/` | No barrel: `installPlugins()` (CORS, Prometheus, rate limit) |
| `shutdown/` | `createShutdown()`, `IShutdown`, `ShutdownOptions`, the timeout defaults |

## Store-TypeORM Module Map (`packages/store-typeorm/src`)

| Path | Purpose |
|------|---------|
| `entities/` | One TypeORM entity per table, the repositories the store queries through; `TableName` and the jsonb transformers (`JSON_VALUE_TRANSFORMER`, `OPTIONAL_JSON_TRANSFORMER`) in `constants.ts`, `toJsonParameter()` (jsonb sanitizing) in `helpers.ts` |
| `migrations/` | `1792195200000-init.ts` (`Init1792195200000`), `1792368000000-artifacts.ts` (table `chamberu_artifacts`), generated from the entities |
| `schema/` | `migrateStore()` (`module.ts`), `STORE_ENTITIES`, `STORE_MIGRATIONS`, `MIGRATION_LOCK_NAME` |
| `store/` | `TypeormStore` (`module.ts`), entity to domain mapping, value builders and `RETURNING` row hydration (`helpers.ts`), `TypeormStoreOptions`, `PurgeResult` |
