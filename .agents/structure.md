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
│   ├── github/                      # @chamberu/github (same layout; aliases core, http, test-kit and itself to src)
│   │   └── test/fixtures/deliveries/ # Recorded GitHub webhook bodies (issues.opened, a bot's issue_comment)
│   ├── sandbox/                     # @chamberu/sandbox (same layout; aliases core and itself; private test/utils/clock.ts, since test-kit peers on it)
│   ├── sandbox-local/               # @chamberu/sandbox-local (aliases core, sandbox, test-kit and itself)
│   ├── sandbox-docker/              # @chamberu/sandbox-docker (same aliases as local)
│   │   └── test/global-setup.ts     # dockerode ping() gate, builds images/sandbox-node as chamberu/sandbox-node:test
│   ├── sandbox-k8s/                 # @chamberu/sandbox-k8s (same aliases; tests drive a fake IPodClient, test/utils/client.ts)
│   ├── coding/                      # @chamberu/coding (aliases core, sandbox, sandbox-local, test-kit and itself)
│   ├── store-typeorm/               # @chamberu/store-typeorm (same layout)
│   │   ├── src/{entities,migrations,schema,store}/
│   │   └── test/global-setup.ts     # Starts postgres:18-alpine via testcontainers for the suite
│   └── docs/                        # @chamberu/docs (private, not released): VitePress site (npm run docs:dev / docs:build)
│       ├── src/.vitepress/          # config.mts, theme/ (Tailwind v4 tokens, Layout.vue), components/{home,layout}/
│       ├── src/public/              # logo.svg (favicon), fixed light/dark logo and run-lifecycle copies
│       └── src/snippets/            # Code samples included via <<<, type-checked by the docs typecheck
├── images/
│   └── sandbox-node/                # Dockerfile + README of ghcr.io/chamberu/sandbox-node (Node 24, git, tini, uid 1000)
├── .github/
│   ├── assets/                      # logo.svg (+ test-kit and organisation variants), run-lifecycle.svg
│   ├── actions/{install,build}/     # Composite actions
│   ├── workflows/{ci,release,docs,images}.yml # CI (Node 22, 24), release-please + npm publish, docs to GitHub Pages, sandbox image (craneship, amd64 + arm64)
│   ├── ISSUE_TEMPLATE/              # Bug report and feature request templates
│   ├── FUNDING.yml                  # GitHub Sponsors
│   └── dependabot.yml               # Daily npm + github-actions updates, docker for images/sandbox-node
├── .husky/commit-msg                # Runs commitlint
├── CONTRIBUTING.md, SECURITY.md, CODE_OF_CONDUCT.md
├── nx.json                          # Task orchestration and caching
├── tsconfig.json                    # Root config, path aliases for every package (@chamberu/core, @chamberu/sandbox, ...) -> packages/*/src
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
| `@chamberu/test-kit` | Exists (0.1.0) | `ControllableClock`, `describeStoreContract()`, `describeWorkspaceContract()`, `createGitFixture()`; depends on core, optional peer on sandbox (types only); core and sandbox never depend on it |
| `@chamberu/http` | Exists (0.1.0) | `createHttpApp()` (routup v6): REST control API, SSE run stream, webhook intake, MCP endpoint, authenticators (static tokens, authup, oidc), health, metrics, `createShutdown()`; peer on core |
| `@chamberu/scheduler` | Exists (0.1.0) | `createScheduler()` (one locked hubwire component per cron trigger), `runJob()`; depends on `hubwire`, peer on core |
| `@chamberu/store-typeorm` | Exists (0.1.0) | `TypeormStore`, entities, initial migration, `migrateStore`, `purgeExpired` |
| `@chamberu/sandbox` | Exists (0.1.0) | `ISandboxProvider`/`IWorkspace`/`IExecTransport` contracts, path, repo, ref, limit and env rules, output collector, `createRemoteWorkspace()`, `prepareWorkspace()`, the run-scoped `createWorkspaceManager()` with `create_workspace`/`dispose_workspace`; depends on `smob`, peer on core and `ai` |
| `@chamberu/sandbox-local` | Exists (0.1.0) | `createLocalSandbox()`: temp directory + spawn, no isolation; peer on core and sandbox |
| `@chamberu/sandbox-docker` | Exists (0.1.0) | `createDockerSandbox()`: one hardened container per workspace; depends on `dockerode` + `@types/dockerode`, `smob`, peer on core and sandbox |
| `@chamberu/sandbox-k8s` | Exists (0.1.0) | `createKubernetesSandbox()`, `createPodClient()`: one hardened pod per workspace; depends on `@kubernetes/client-node`, `smob`, peer on core and sandbox |
| `@chamberu/coding` | Exists (0.1.0) | `codingTools()` (read_file, write_file, edit_file, grep, list_files, bash, git_diff), the `ICodingBackend` contract; depends on `smob`, peer on core, sandbox and `ai` |
| `@chamberu/coding-claude-code` | Planned | Claude Code coding backend |
| `@chamberu/github` | Exists (0.1.0) | `createGithubApp()` (App JWT, `IClock` installation-token cache, Octokit per installation), `githubWebhook()` trigger, the signed webhook route for `createHttpApp({ routes })`, read tools and effect write tools; depends on `@octokit/core` + `plugin-paginate-rest`, peer on core, http (types only) and `ai` |
| `@chamberu/notify-openclaw`, `@chamberu/notify-github` | Planned | Notifiers |
| `@chamberu/ui` | Planned | Vue 3 dashboard |
| `chamberu` | Planned | Umbrella package and CLI |

The memory store lives inside `@chamberu/core` (no separate `store-memory` package), because every test needs it.

## Core Module Map (`packages/core/src`)

Every module is a folder with `module.ts`, `types.ts`, `helpers.ts`, `constants.ts` and an `index.ts` barrel as needed (see [conventions](conventions.md#file-organization)).

| Path | Purpose |
|------|---------|
| `errors/` | `ChamberuError` (`base.ts`), one file per subclass, `ErrorCode` (`constants.ts`) |
| `agent/` | `defineAgent()`, `AgentDefinition`, name rules and budget defaults (`constants.ts`), `assertToolsContext()` (`helpers.ts`, internal) |
| `trigger/` | `TriggerDefinition`, `TriggerEnvelope`, `Invoker` (`types.ts`), `toInvoker()` validation (`helpers.ts`, internal); `cron/`, `http/`, `webhook/` each hold their factory (`module.ts`) and options type (`types.ts`) |
| `artifact/` | `Artifact`, `ArtifactInput`, `IRunArtifacts` (`types.ts`); `ARTIFACT_URI_PREFIX` (`constants.ts`, internal); `createRunArtifacts()`, `storeArtifact()`, `attachmentIds()` (`module.ts`, the latter two internal); `isArtifactMediaType()` (`media-type.ts`, public); `assertArtifactInput()`, `toFilePart()`, `hydrateMessages()` (`helpers.ts`) |
| `run/` | `RunStatus` enum (`constants.ts`); `Run`, `RunStatusLiteral`, `Step`, `Checkpoint`, `WaitPoint`, `Budget`, `Usage` |
| `store/types.ts` | `IStore` and its parts (see architecture) |
| `store/memory/` | `MemoryStore` |
| `engine/` | `Engine` (`module.ts`), `RunEvent`, `RunDelta`, `DispatchEnvelope` (`types.ts`), `budget.ts` (stop conditions), `queue/` (scheduler), `execute/` (one streamed execution) |
| `effect/` | `defineEffectTool()`, `effectMarker()` (`define.ts`), `wrapToolsForRun()` (`wrap.ts`), `EFFECT` |
| `tool/` | `ToolContext` (`types.ts`), `toolContextSchema` (`constants.ts`), `defineTool()` (`define.ts`), `hasToolContext()` (`helpers.ts`, internal) |
| `approval/` | Signed resume tokens |
| `notify/types.ts` | `INotifier`, `Notification` |
| `permission/` | `matchesPermission()`, `hasPermission()`, `toolPermission()` (`match.ts`), `requireToolPermission()` (`policy.ts`), `RequireToolPermissionOptions` (`types.ts`), `PERMISSION_ALL` (`constants.ts`, internal) |
| `state/` | `createAgentState()` (`module.ts`, validation via `@validup/standard-schema`), generated tools (`tools.ts`) |
| `clock/` | `IClock`, `systemClock` |

`src/index.ts` re-exports each folder's `index.ts`. `@chamberu/test-kit` (`packages/test-kit/src`) holds `clock/` (`ControllableClock`), `store-contract/` (`describeStoreContract`), `workspace-contract/` (`describeWorkspaceContract`, `WorkspaceContractFactory`) and `git-fixture/` (`createGitFixture`, `GitFixture`).

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
| `app/` | `createHttpApp()` (`module.ts`), `HttpAppOptions`, the `HttpRoute*` types and the internal `HttpContext` (`types.ts`), defaults and `RESERVED_ROUTE_SEGMENTS` (`constants.ts`), `buildContext()` (incl. `validateRoutes()`) and the JSON error handler (`helpers.ts`) |
| `auth/` | `Principal`, `Authenticator` (`types.ts`), `Permission` (`constants.ts`), `agentPermission()` (`module.ts`; permission matching is core's `hasPermission(principal.permissions, ...)`), `authenticate()`, `authorize()`, `readBearerToken()`, `toInvoker()` (`helpers.ts`, internal; display name from `name` or `preferred_username`, never `email`); `static-tokens/`, `authup/`, `oidc/` hold the built-in authenticators |
| `request/` | No barrel: `readJsonBody()`, `validateBody()`, `validatePayload()`, `decodeQuery()` (rapiq), `readIdempotencyHeader()`, `boundReceived()`, `boundIssues()` (`helpers.ts`); `KEY_MAX_LENGTH`, `RECEIVED_MAX_LENGTH` (`constants.ts`); validup validators `isString()`, `isBoolean()`, `isDefined()`, `isArrayOf()`, `isMediaType()`, `isBase64()` (`validators.ts`) |
| `health/` | No barrel: `/healthz`, `/readyz` |
| `runs/` | Run and artifact routes (`module.ts`), `serializeRun()`, `serializeStep()`, `canReadRun()`, `loadReadableRun()`, `loadRunArtifact()`, `contentDisposition()`, `assertCanListRuns()`, `parseRunListQuery()`, `resolveResumeTarget()` (`helpers.ts`), `MAX_ATTACHMENTS` (`constants.ts`, internal), `RunView`, `InvokerView`, `RunListQuery` (`types.ts`); `stream/` holds `streamRun()` (SSE, incl. `delta`) |
| `hooks/` | No barrel: `POST /hooks/:agent<path>` |
| `routes/` | No barrel: `registerRoutes()` serves `HttpAppOptions.routes` (extra routes of other packages) |
| `agents/` | `/agents`, `/schedules` and state routes (`module.ts`), `AgentSummary`, `ScheduleSummary` (`types.ts`) |
| `mcp/` | `createMcpEndpoint()`, `registerMcpRoutes()` (`module.ts`), the tools (`tools.ts`), `waitForRun()`, `toJsonSchema()` (`helpers.ts`), `RunSummary`, `RunToolResult` (`types.ts`) |
| `plugins/` | No barrel: `installPlugins()` (CORS, Prometheus, rate limit) |
| `shutdown/` | `createShutdown()`, `IShutdown`, `ShutdownOptions`, the timeout defaults |

## GitHub Module Map (`packages/github/src`)

| Path | Purpose |
|------|---------|
| `app/` | `createGithubApp()` (`module.ts`), `GithubAppOptions`, `IGithubApp`, `GithubOctokit` (`types.ts`), `DEFAULT_WEBHOOK_PATH`, `DEFAULT_GITHUB_API_URL` (`constants.ts`), `PaginatedOctokit` and option normalizers (`helpers.ts`, internal) |
| `auth/` | No barrel: `createInstallationTokens()` (`module.ts`, token cache), `createAppJwt()`, `normalizePrivateKey()` (`helpers.ts`), `JWT_*`, `TOKEN_REFRESH_MARGIN_MS`, `GITHUB_USER_AGENT` (`constants.ts`) |
| `trigger/` | `githubWebhook()` (`module.ts`), `GithubEvent`, `GithubPayload`, `GithubWebhookTriggerOptions` (`types.ts`); `matchesGithubTrigger()`, `defaultConcurrencyKey()` (`helpers.ts`, internal) |
| `webhook/` | `createWebhookRoute()` (`module.ts`, internal), `verifySignature()`, `readHeaders()`, `toGithubEvent()`, `assertDerivedKey()` (`helpers.ts`), `GithubWebhookRouteOptions`, `GithubWebhookResult` (`types.ts`, the only exports) |
| `tools/` | `createReadTools()` (`read.ts`), `createWriteTools()` (`write.ts`), `installationIdOf()`, `parseRepo()`, `stepOf()`, `toolError()`, `withOctokit()` and the input schema builders (`helpers.ts`), limits and `REPO_PATTERN` (`constants.ts`), result shapes (`types.ts`, the only exports) and the internal `RepoInput`/`NumberInput` |

## Sandbox Module Map (`packages/sandbox/src`)

| Path | Purpose |
|------|---------|
| `workspace/` | `IWorkspace`, `WorkspaceInfo`, `ExecOptions`, `ExecResult` (`types.ts`); `WORKSPACE_ROOT`, `OUTPUT_MAX_BYTES`, `FILE_MAX_BYTES`, `EXEC_TIMEOUT_MS`, `EXEC_TIMEOUT_MAX_MS`, `SANDBOX_ENV` (`constants.ts`) |
| `provider/` | `ISandboxProvider`, `WorkspaceCreateOptions`, `SandboxLimits` (`types.ts`); `DEFAULT_LIMITS`, `DEFAULT_SANDBOX_IMAGE`, `TMP_SIZE`, `SANDBOX_LABELS`, `RUN_LABEL`, `WORKSPACE_LABEL`, `EXPIRES_AT_KEY` (`constants.ts`) |
| `limits/` | `resolveLimits()`, `parseCpu()`, `parseMemory()`, `assertSandboxEnv()` (`module.ts`); patterns and units (`constants.ts`, internal) |
| `output/` | `createOutputCollector()` (`module.ts`), `IOutputCollector` (`types.ts`), `completeLength()` (UTF-8 cut, `helpers.ts`) |
| `path/` | `resolveWorkspacePath()` |
| `repo/` | `normalizeRepo()`, `assertGitRef()`, `prepareWorkspace()` (`module.ts`), `checkoutCommands()` and URL checks (`helpers.ts`, internal), `NormalizeRepoOptions` |
| `remote/` | `createRemoteWorkspace()` over an `IExecTransport` (`module.ts`), `wrapTimeout()`, `isTimeoutExit()`, output and argv helpers (`helpers.ts`, internal), `TIMEOUT_KILL_AFTER_SECONDS`, `EXEC_GRACE_MS`, `ALIVE_PROBE_TIMEOUT_MS` (public) and `WRITE_FILE_SCRIPT` (`constants.ts`) |
| `manager/` | `createWorkspaceManager()` (`module.ts`), `createWorkspaceTools()` (`tools.ts`, internal), option checks and tool input helpers (`helpers.ts`), `MAX_WORKSPACES_PER_RUN`, `GC_INTERVAL_MS`, `CLOSE_TIMEOUT_MS` (`constants.ts`) |

`@chamberu/sandbox-local` (`packages/sandbox-local/src/provider/`): `createLocalSandbox()` (`module.ts`), `LocalWorkspace` (`workspace.ts`, spawn per exec in its own process group), `collectExpired()` (`gc.ts`), `buildEnv()`, `killGroup()`, `exitCodeOf()`, `collectionError()` (`helpers.ts`), `LOCAL_PROVIDER_NAME`, `REPO_DIR`, `WORKSPACE_RECORD`, `KILL_GRACE_MS` (`constants.ts`, internal; only `createLocalSandbox` is exported).

## Docker Sandbox Module Map (`packages/sandbox-docker/src`)

| Path | Purpose |
|------|---------|
| `provider/` | `createDockerSandbox()` (`module.ts`), `buildContainerOptions()`, `assertDockerOptions()`, `pullImage()`, `removeContainer()`, `collectionError()` (`helpers.ts`, internal), `DEFAULT_NETWORK`, `CONTAINER_NAME_PREFIX`, `SANDBOX_USER` (`constants.ts`), `DockerSandboxOptions` (`types.ts`) |
| `transport/` | No barrel: `createDockerTransport()`, the `IExecTransport` over the Docker exec API (demuxed streams into output collectors, exit code by inspect poll, `alive` by container inspect) |

## Kubernetes Sandbox Module Map (`packages/sandbox-k8s/src`)

| Path | Purpose |
|------|---------|
| `provider/` | `createKubernetesSandbox()` (`module.ts`), `buildPod()`, `podState()`, `assertKubernetesOptions()`, `loadDefaultKubeConfig()`, `collectionError()` (`helpers.ts`, internal), `CONTAINER_NAME`, `POD_NAME_PREFIX`, `START_TIMEOUT_MS`, `POLL_MS`, `FATAL_WAITING_REASONS` (`constants.ts`), `KubernetesSandboxOptions` (`types.ts`) |
| `client/` | `createPodClient()` (`module.ts`), `createPodClientFrom()` (`helpers.ts`, the test seam over `core`/`exec`), `IPodClient` and parts (`types.ts`), `STDIN_CLOSE_PROTOCOL` (`v5.channel.k8s.io`) |
| `transport/` | No barrel: `createPodTransport()`, the `IExecTransport` over `IPodClient.exec` (`alive` by pod read) |

## Coding Module Map (`packages/coding/src`)

| Path | Purpose |
|------|---------|
| `tools/` | `codingTools()` (`module.ts`); `read_file`, `write_file`, `edit_file` (`files.ts`), `grep`, `list_files` (`search.ts`), `bash` (`shell.ts`), `git_diff` (`git.ts`); input checks, `workspaceOf()`, `objectSchema()` (`helpers.ts`); `READ_MAX_LINES`, `READ_MAX_CHARS`, `SEARCH_MAX_RESULTS`, `LIST_MAX_RESULTS`, `LINE_MAX_CHARS` (public) and defaults (`constants.ts`); result types (`types.ts`) |
| `backend/` | `ICodingBackend`, `CodingTask`, `CodingResult`, `CodingBudget` (types only) |

## Store-TypeORM Module Map (`packages/store-typeorm/src`)

| Path | Purpose |
|------|---------|
| `entities/` | One TypeORM entity per table, the repositories the store queries through; `TableName` and the jsonb transformers (`JSON_VALUE_TRANSFORMER`, `OPTIONAL_JSON_TRANSFORMER`) in `constants.ts`, `toJsonParameter()` (jsonb sanitizing) in `helpers.ts` |
| `migrations/` | `1792195200000-init.ts` (`Init1792195200000`), `1792368000000-artifacts.ts` (table `chamberu_artifacts`), generated from the entities; `1792454400000-idempotency-scope.ts` (`scope` varchar(1024), hand-written) |
| `schema/` | `migrateStore()` (`module.ts`), `STORE_ENTITIES`, `STORE_MIGRATIONS`, `MIGRATION_LOCK_NAME` |
| `store/` | `TypeormStore` (`module.ts`), entity to domain mapping, value builders and `RETURNING` row hydration (`helpers.ts`), `TypeormStoreOptions`, `PurgeResult` |
