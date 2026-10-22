# Project Structure

## Directory Layout

```
chamvi/
├── packages/
│   ├── core/                        # @chamvi/core
│   │   ├── src/                     # Library source (entry: src/index.ts), one folder per module
│   │   ├── test/
│   │   │   ├── vitest.config.ts     # Aliases @chamvi/core to ../src/index.ts
│   │   │   ├── unit/                # *.spec.ts, one folder per src module (agent/, engine/, ...)
│   │   │   ├── fixtures/            # readme-example.ts (the README example, run as a test)
│   │   │   └── utils/               # mock-model.ts, clock.ts (private ControllableClock copy)
│   │   ├── README.md                # Package README (must contain the fixture verbatim)
│   │   ├── tsdown.config.ts         # Builds dist/index.mjs + .d.mts
│   │   ├── tsconfig.json            # src + test (typecheck)
│   │   └── tsconfig.build.json      # src only (build:types)
│   ├── scheduler/                   # @chamvi/scheduler (same layout; aliases core, test-kit and itself to src)
│   ├── http/                        # @chamvi/http (same layout; aliases core, test-kit and itself to src)
│   ├── test-kit/                    # @chamvi/test-kit (same layout; aliases core and itself to src)
│   ├── github/                      # @chamvi/github (same layout; aliases core, http, test-kit, itself and its /module, app, app/testing, scheduler, store-typeorm to src)
│   │   └── test/fixtures/deliveries/ # Recorded GitHub webhook bodies (issues.opened, a bot's issue_comment)
│   ├── notify-openclaw/             # @chamvi/notify-openclaw (aliases core, test-kit, itself and its /module, plus app, app/testing, http, scheduler, store-typeorm; fake gateway in test/utils/openclaw.ts)
│   ├── notify-github/               # @chamvi/notify-github (aliases core, github, http, test-kit, itself and its /module, plus app, app/testing, http, scheduler, store-typeorm)
│   ├── sandbox/                     # @chamvi/sandbox (same layout; aliases core, itself and its /module, sandbox-local, app, app/testing, http, scheduler, store-typeorm; private test/utils/clock.ts)
│   ├── sandbox-local/               # @chamvi/sandbox-local (aliases core, sandbox, test-kit and itself)
│   ├── sandbox-docker/              # @chamvi/sandbox-docker (same aliases as local)
│   │   └── test/global-setup.ts     # dockerode ping() gate, builds images/sandbox-node as chamvi/sandbox-node:test
│   ├── sandbox-k8s/                 # @chamvi/sandbox-k8s (same aliases; tests drive a fake IPodClient, test/utils/client.ts)
│   ├── coding/                      # @chamvi/coding (aliases core, sandbox, sandbox-local, test-kit and itself)
│   ├── ui/                          # @chamvi/ui (aliases core, http, test-kit, itself and its /module, plus app, app/testing, scheduler, store-typeorm to src)
│   │   ├── src/                     # Node entries (tsdown -> dist/index.mjs: uiRoutes(); dist/module.mjs: uiModule())
│   │   ├── app/                     # The SPA (Vite root -> dist/app), own tsconfig for vue-tsc
│   │   └── test/{unit,e2e}/         # Vitest (routes, app modules), Playwright smoke spec + demo server
│   ├── app/                         # @chamvi/app (aliases every workspace package it imports, itself and its subpaths to src)
│   │   ├── src/                     # main entry src/index.ts, subpath entries src/{authup,testing}/index.ts
│   │   └── test/                    # global-setup.ts (postgres:18-alpine via testcontainers), utils/harness.ts (aliases @chamvi/app/testing's harness)
│   ├── cli/                         # @chamvi/cli (bin chamvi -> dist/cli.mjs; aliases app and its imports to src)
│   │   ├── src/cli.ts               # the bin (shebang, then the header)
│   │   └── test/fixtures/           # apps the commands and the spawned bin run: app (README), failing, hang, slow, keyless, broken
│   ├── store-typeorm/               # @chamvi/store-typeorm (same layout)
│   │   ├── src/{entities,migrations,schema,store}/
│   │   └── test/global-setup.ts     # Starts postgres:18-alpine via testcontainers for the suite
│   └── docs/                        # @chamvi/docs (private, not released): VitePress site (npm run docs:dev / docs:build)
│       ├── src/.vitepress/          # config.mts, theme/ (Tailwind v4 tokens, Layout.vue), components/{home,layout}/
│       ├── src/public/              # logo.svg (favicon), fixed light/dark logo and run-lifecycle copies
│       └── src/snippets/            # Code samples included via <<<, type-checked by the docs typecheck
├── images/
│   └── sandbox-node/                # Dockerfile + README of ghcr.io/chamvi/sandbox-node (Node 24, git, tini, uid 1000)
├── .github/
│   ├── assets/                      # logo.svg (+ test-kit and organisation variants), run-lifecycle.svg
│   ├── actions/{install,build}/     # Composite actions
│   ├── workflows/{ci,release,docs,images}.yml # CI (Node 22, 24, plus the Chromium e2e job), release-please + npm publish, docs to GitHub Pages, sandbox image (craneship, amd64 + arm64)
│   ├── ISSUE_TEMPLATE/              # Bug report and feature request templates
│   ├── FUNDING.yml                  # GitHub Sponsors
│   └── dependabot.yml               # Daily npm + github-actions updates, docker for images/sandbox-node
├── .husky/commit-msg                # Runs commitlint
├── CONTRIBUTING.md, SECURITY.md, CODE_OF_CONDUCT.md
├── nx.json                          # Task orchestration and caching
├── tsconfig.json                    # Root config, path aliases for every package (@chamvi/core, @chamvi/sandbox, @chamvi/notify-*, ...) -> packages/*/src
├── tsconfig.build.json              # Shared compiler options
├── eslint.config.js                 # @tada5hi/eslint-config flat config
├── commitlint.config.mjs            # Conventional Commits
├── release-please-config.json       # Per-package release config
└── .release-please-manifest.json    # Current released versions
```

## Packages

| Package | Status | Responsibility |
|---------|--------|----------------|
| `@chamvi/core` | Exists (0.1.0) | defineAgent, run engine (streaming, structured output), `provide`/`inject` context for tools (`defineContextKey`, `inject`, `tryInject`), checkpoints, trigger model, run artifacts, state API, budgets, IStore/INotifier interfaces (`NotifyOptions` with the run's trigger), `consoleNotifier()`, in-memory store |
| `@chamvi/test-kit` | Exists (0.1.0) | `ControllableClock`, `describeStoreContract()`, `describeWorkspaceContract()`, `createGitFixture()`, `createFakeGithub()` (in-process GitHub for `createGithubApp({ fetch })`); depends on core only (the workspace contract types `IWorkspace` structurally as `ContractWorkspace`: a sandbox edge would close a release-please cycle through app); core and sandbox never depend on it |
| `@chamvi/http` | Exists (0.1.0) | `createHttpApp()` (routup v6): REST control API, SSE run stream, webhook intake, MCP endpoint, authenticators (static tokens, authup, oidc), health, metrics, `createShutdown()`; peer on core |
| `@chamvi/scheduler` | Exists (0.1.0) | `createScheduler()` (one locked hubwire component per cron trigger), `runJob()`; depends on `hubwire`, peer on core |
| `@chamvi/store-typeorm` | Exists (0.1.0) | `TypeormStore`, entities, initial migration, `migrateStore`, `purgeExpired` |
| `@chamvi/sandbox` | Exists (0.1.0) | `ISandboxProvider`/`IWorkspace`/`IExecTransport` contracts, path, repo, ref, limit and env rules, output collector, `createRemoteWorkspace()`, `prepareWorkspace()`, the run-scoped `createWorkspaceManager()` with `create_workspace`/`dispose_workspace`, the context pair `provideSandboxContext`/`injectSandboxContext`; `/module`: `sandboxModule()` (optional peer on `@chamvi/app`, the providers optional peers loaded by variable specifier); depends on `smob`, peer on core and `ai` |
| `@chamvi/sandbox-local` | Exists (0.1.0) | `createLocalSandbox()`: temp directory + spawn, no isolation; peer on core and sandbox |
| `@chamvi/sandbox-docker` | Exists (0.1.0) | `createDockerSandbox()`: one hardened container per workspace; depends on `dockerode` + `@types/dockerode`, `smob`, peer on core and sandbox |
| `@chamvi/sandbox-k8s` | Exists (0.1.0) | `createKubernetesSandbox()`, `createPodClient()`: one hardened pod per workspace; depends on `@kubernetes/client-node`, `smob`, peer on core and sandbox |
| `@chamvi/coding` | Exists (0.1.0) | `codingTools()` (read_file, write_file, edit_file, grep, list_files, bash, git_diff), the `ICodingBackend` contract; depends on `smob`, peer on core, sandbox and `ai` |
| `@chamvi/ui` | Exists (0.1.0) | `uiRoutes()`: serves the prebuilt Vue 3 + vuecs dashboard (runs, run detail, approvals, agent state, schedules) as one extra route of `createHttpApp({ routes })`; `/module`: `uiModule()` (optional peer on `@chamvi/app`); peer on core and http (types only), every SPA library a bundled devDependency |
| `@chamvi/app` | Exists (0.1.0) | `createApp()` (`IApp`: `start`, `stop`, `runJob`, `migrate`), built-in orkos modules (config, store, static tokens, engine, scheduler, http, console notifier) over an eldin container, `AppToken`s, env readers, `readConfig()`, the JSON line logger, the model registry; the module contract (tokens, `ModuleName`, env readers, `approvalUrlOf`, `AppContext`, `ILifecycleHook`, the orkos `IModule` and eldin `IContainer` types); subpaths `/authup` (`authupModule`, `oidcModule`) and `/testing` (`buildModuleHarness()`, `createModuleHarness()`), the other optional modules live in their feature packages on `/module`; re-exports core and part of http; depends on core, http, scheduler, store-typeorm, `orkos`, `eldin`, `envix`, `routup`, `smob`, peer on `ai`, `typeorm`, `pg` (optional: the AI SDK provider packages and the two `@authup/*` packages; no `@chamvi/*` feature package in any dependency field) |
| `@chamvi/cli` | Exists (0.1.0) | The `chamvi` bin (citty): `dev`, `build`, `start`, `run-job`, `migrate`, entry loading, signals, exit codes `0/1/2`; `runCli()`; depends on `citty`, peer on app (optional `tsdown`) |
| `@chamvi/coding-claude-code` | Planned | Claude Code coding backend |
| `@chamvi/github` | Exists (0.1.0) | `createGithubApp()` (App JWT, `IClock` installation-token cache, Octokit per installation), `githubWebhook()` trigger, the signed webhook route for `createHttpApp({ routes })`, read tools and effect write tools, the context pair `provideGithubContext`/`injectGithubContext`; `/module`: `githubModule()` (optional peer on `@chamvi/app`); depends on `@octokit/core` + `plugin-paginate-rest`, peer on core, http (types only) and `ai` |
| `@chamvi/notify-openclaw` | Exists (0.1.0) | `openclaw()`: `POST <hooksPath>/agent` with `Idempotency-Key`, a deterministic message, an `IClock` timeout, the context pair `provideOpenclawContext`/`injectOpenclawContext` (per notifier name); `/module`: `openclawModule()` (optional peer on `@chamvi/app`); no runtime dependencies, peer on core |
| `@chamvi/notify-github` | Exists (0.1.0) | `githubNotifier()`: one comment on the run's issue/PR (or `target`), deduplicated by `effectMarker()` found before posting, the context pair `provideGithubNotifierContext`/`injectGithubNotifierContext` (per notifier name); `/module`: `githubNotifierModule()` (optional peer on `@chamvi/app`); depends on `smob`, peer on core and github |
| `@chamvi/chat` | New (0.0.0) | `createChatBridge({ chat })` over a Chat SDK (`chat`) instance: one `anyBody` webhook route per adapter, Chat SDK handlers that dispatch `chatTrigger()` runs (`source: 'channel'`, idempotency key = platform message, concurrency key and `thread` = platform thread, optional thread history in the payload), a notifier posting approval cards whose buttons answer through `engine.approve()` (approver from `resolveInvoker`, needs `agent:<name>:approve`), the `chat_reply` effect tool; sent notifications and replies are remembered in the Chat SDK state adapter; depends on `smob`, peer on core, http (types only), `ai` and `chat` |

The memory store lives inside `@chamvi/core` (no separate `store-memory` package), because every test needs it.

## Core Module Map (`packages/core/src`)

Every module is a folder with `module.ts`, `types.ts`, `helpers.ts`, `constants.ts` and an `index.ts` barrel as needed (see [conventions](conventions.md#file-organization)).

| Path | Purpose |
|------|---------|
| `errors/` | `ChamviError` (`base.ts`), one file per subclass, `ErrorCode` (`constants.ts`) |
| `context/` | `defineContextKey()`, `inject()`, `tryInject()` (`module.ts`), `ContextKey`, `IContextProvider` (`types.ts`), the key `WeakSet` and the ToolContext `WeakMap`: `registerContextKey()`, `isContextKey()`, `bindProvided()`, `providedOf()`, `contextKeyName()` (`helpers.ts`, internal); `ContextNotProvidedError` lives in `errors/context-not-provided.ts` |
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
| `notify/` | `INotifier`, `Notification`, `NotifyOptions`, `ConsoleNotifierOptions` (`types.ts`), `consoleNotifier()` (`console.ts`) |
| `permission/` | `matchesPermission()`, `hasPermission()`, `toolPermission()` (`match.ts`), `requireToolPermission()` (`policy.ts`), `RequireToolPermissionOptions` (`types.ts`), `PERMISSION_ALL` (`constants.ts`, internal) |
| `state/` | `createAgentState()` (`module.ts`, validation via `@validup/standard-schema`), generated tools (`tools.ts`) |
| `clock/` | `IClock`, `systemClock` |

`src/index.ts` re-exports each folder's `index.ts`. `@chamvi/test-kit` (`packages/test-kit/src`) holds `clock/` (`ControllableClock`), `store-contract/` (`describeStoreContract`), `workspace-contract/` (`describeWorkspaceContract`, `WorkspaceContractFactory`), `git-fixture/` (`createGitFixture`, `GitFixture`) and `github-fake/` (`createFakeGithub` in `module.ts`, `FakeGithub`, `FakeGithubOptions`, `FakeRequest`, `FakeRoute*`, `JwtClaims` in `types.ts`, the repository routes and `abortable()` in `helpers.ts`).

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
| `runs/` | Run and artifact routes (`module.ts`), `serializeRun()`, `serializeStep()`, `canReadRun()`, `loadReadableRun()`, `loadRunArtifact()`, `contentDisposition()`, `assertCanListRuns()`, `parseRunListQuery()`, `resolveResumeTarget()`, `loadApprovableRun()`, `createApproveContainer()` (`helpers.ts`), `MAX_ATTACHMENTS`, `APPROVAL_ID_MAX_LENGTH` (`constants.ts`, internal), `RunView`, `InvokerView`, `RunListQuery`, `ApproveBody` (`types.ts`); `stream/` holds `streamRun()` (SSE, incl. `delta`) |
| `hooks/` | No barrel: `POST /hooks/:agent<path>` |
| `routes/` | No barrel: `registerRoutes()` serves `HttpAppOptions.routes` (extra routes of other packages; prefix routes, headers, byte bodies), `routeSubpath()` (`helpers.ts`) |
| `agents/` | `/agents`, `/schedules` and state routes (`module.ts`, incl. the KV listing via `parseKvListQuery()` in `helpers.ts`), `AgentSummary`, `ScheduleSummary` (`types.ts`) |
| `me/` | `GET /me` (`registerMeRoutes()`, `module.ts`), `MeView` (`types.ts`, the only export) |
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
| `tools/` | `createReadTools()` (`read.ts`), `createWriteTools()` (`write.ts`), `installationIdOf()`, `parseRepo()`, `stepOf()`, `toolError()`, `withOctokit()` and the input schema builders (`helpers.ts`), limits, `REPO_PATTERN` and `GITHUB_REQUEST_ERROR_CODE` (`constants.ts`; those two are exported, for `@chamvi/notify-github`), result shapes (`types.ts`) and the internal `RepoInput`/`NumberInput` |
| `context/` | `provideGithubContext()`, `injectGithubContext()` (`module.ts`), `GITHUB_CONTEXT` (`constants.ts`, internal; key `github`) |
| `module/` | The `/module` entry (the only folder importing `@chamvi/app`): `githubModule()`, `GithubModule` (`module.ts`), `createGithubAppFromEnv()` (`helpers.ts`), `GITHUB_MODULE_NAME` (`constants.ts`), `GithubModuleOptions` (`types.ts`) |

## Notifier Module Maps

`@chamvi/notify-openclaw` (`packages/notify-openclaw/src/notifier/`): `openclaw()` (`module.ts`); `OpenclawNotifierOptions`, `OpenclawDelivery`, `OpenclawHookBody` (`types.ts`, public between `#region public` markers the docs include) and the internal `ResolvedOpenclawOptions`; `DEFAULT_HOOKS_PATH`, `OPENCLAW_TIMEOUT_MS`, `OPENCLAW_REQUEST_ERROR_CODE`, `MESSAGE_BODY_MAX_LENGTH` (public) and `DEFAULT_NOTIFIER_NAME`, `HOOK_NAME`, `IDEMPOTENCY_KEY_MAX_LENGTH`, `ERROR_TEXT_MAX_LENGTH`, `NO_TOKEN_HINT` (internal) (`constants.ts`); `resolveOptions()`, `hookUrl()`, `renderMessage()`, `transportKey()`, `cutText()`, `redact()`, `requestError()`, `responseError()` (`helpers.ts`). `context/`: `provideOpenclawContext()`, `injectOpenclawContext()` (`module.ts`), `openclawContextKey(name)` (`helpers.ts`, internal; keys `openclaw:<name>`, memoized). `module/` (the `/module` entry, the only folder importing `@chamvi/app`): `openclawModule()`, `OpenclawModule` (`module.ts`), `readDelivery()` (`helpers.ts`), `ERROR_PREFIX`, `VARIABLES` (`constants.ts`), `OpenclawModuleOptions` (`types.ts`).

`@chamvi/notify-github` (`packages/notify-github/src/notifier/`): `githubNotifier()` (`module.ts`, the reconcile and the post); `GithubNotifierOptions`, `GithubNotifierTarget` (`types.ts`, public region) and the internal `CommentTarget`, `ResolvedGithubNotifierOptions`; `GITHUB_NOTIFIER_TIMEOUT_MS`, `COMMENT_BODY_MAX_LENGTH` (public) and `DEFAULT_NOTIFIER_NAME`, `LOGIN_PATTERN`, `RECONCILE_SKEW_MS`, `SAFE_KEY_PATTERN`, `BACKTICK_RUN_MAX_LENGTH` (internal) (`constants.ts`); `resolveOptions()`, `resolveTarget()`, `markerKey()`, `cutText()`, `fenceFor()`, `renderComment()`, `isSameLogin()` (`helpers.ts`). `context/`: `provideGithubNotifierContext()`, `injectGithubNotifierContext()` (`module.ts`), `githubNotifierContextKey(name)` (`helpers.ts`, internal; keys `notify-github:<name>`, memoized). `module/` (the `/module` entry, the only folder importing `@chamvi/app`): `githubNotifierModule()`, `GithubNotifierModule` (`module.ts`), `GithubNotifierModuleOptions` (`types.ts`).

## Sandbox Module Map (`packages/sandbox/src`)

| Path | Purpose |
|------|---------|
| `workspace/` | `IWorkspace`, `WorkspaceInfo`, `ExecOptions`, `ExecResult` (`types.ts`); `assertArgv()` (`module.ts`); `WORKSPACE_ROOT`, `OUTPUT_MAX_BYTES`, `FILE_MAX_BYTES`, `EXEC_TIMEOUT_MS`, `EXEC_TIMEOUT_MAX_MS`, `SANDBOX_ENV` (`constants.ts`) |
| `provider/` | `ISandboxProvider`, `WorkspaceCreateOptions`, `SandboxLimits` (`types.ts`); `DEFAULT_LIMITS`, `DEFAULT_SANDBOX_IMAGE`, `TMP_SIZE`, `SANDBOX_LABELS`, `SANDBOX_LABEL_SELECTORS`, `RUN_LABEL`, `WORKSPACE_LABEL`, `EXPIRES_AT_KEY` (`constants.ts`); the helpers every provider shares: `assertCreateInput()`, `abortedCreate()`, `assertImageOption()`, `assertClockOption()`, `buildWorkspaceInfo()`, `isExpiredAt()`, `collectionError()` (`module.ts`), `isName()` (`helpers.ts`, internal) |
| `clock/` | `delay()` (a wait on the `IClock` that rejects with the caller's abort error) |
| `limits/` | `resolveLimits()`, `parseCpu()`, `parseMemory()`, `assertSandboxEnv()` (`module.ts`); patterns and units (`constants.ts`, internal) |
| `output/` | `createOutputCollector()`, `createSinkStream()` (a `Writable` into an `IOutputSink`) (`module.ts`), `IOutputCollector` (`types.ts`), `completeLength()` (UTF-8 cut, `helpers.ts`) |
| `path/` | `resolveWorkspacePath()`, `absoluteWorkspacePath()` |
| `repo/` | `normalizeRepo()`, `assertGitRef()`, `prepareWorkspace()` (`module.ts`), `checkoutCommands()` and URL checks (`helpers.ts`, internal), `NormalizeRepoOptions` |
| `remote/` | `createRemoteWorkspace()` over an `IExecTransport` (`module.ts`), `wrapTimeout()`, `wrapExec()`, `exitMarker()`, `createExitMarkerFilter()`, `isTimeoutExit()`, output helpers (`helpers.ts`, internal), `TIMEOUT_KILL_AFTER_SECONDS`, `EXEC_GRACE_MS`, `ALIVE_PROBE_TIMEOUT_MS` (public), `EXIT_DRAIN_MS`, `EXIT_MARKER_CWD`, `EXEC_SCRIPT` and `WRITE_FILE_SCRIPT` (`constants.ts`, internal) |
| `manager/` | `createWorkspaceManager()` (`module.ts`), `createWorkspaceTools()` (`tools.ts`, internal), option checks and tool input helpers (`helpers.ts`), `MAX_WORKSPACES_PER_RUN`, `GC_INTERVAL_MS`, `CLOSE_TIMEOUT_MS` (`constants.ts`) |
| `context/` | `provideSandboxContext()`, `injectSandboxContext()` (`module.ts`), `SANDBOX_CONTEXT` (`constants.ts`, internal; key `sandbox`) |
| `module/` | The `/module` entry (the only folder importing `@chamvi/app`): `sandboxModule()`, `SandboxModule` (`module.ts`), `createLazyProvider()` (`provider.ts`), `isPackageNotFound()` (a copy of the app's), `loadPackage()` (`helpers.ts`), `SANDBOX_MODULE_NAME`, `SANDBOX_PROVIDER_NAMES` (public), `SANDBOX_PROVIDER_PACKAGES`, `SANDBOX_PROVIDER_IDS` (`constants.ts`), `SandboxModuleOptions`, `SandboxProviderName` (public region) and the structural provider package types (`types.ts`) |

`@chamvi/sandbox-local` (`packages/sandbox-local/src/provider/`): `createLocalSandbox()` (`module.ts`), `LocalWorkspace` (`workspace.ts`, spawn per exec in its own process group), `collectExpired()` (`gc.ts`), `buildEnv()`, `killGroup()`, `exitCodeOf()` (`helpers.ts`), `LOCAL_PROVIDER_NAME`, `REPO_DIR`, `WORKSPACE_RECORD`, `KILL_GRACE_MS` (`constants.ts`, internal; only `createLocalSandbox` is exported).

## Docker Sandbox Module Map (`packages/sandbox-docker/src`)

| Path | Purpose |
|------|---------|
| `provider/` | `createDockerSandbox()` (`module.ts`), `buildContainerOptions()`, `assertDockerOptions()`, `pullImage()`, `removeContainer()` (`helpers.ts`, internal), `DEFAULT_NETWORK`, `CONTAINER_NAME_PREFIX`, `SANDBOX_USER` (`constants.ts`), `DockerSandboxOptions` (`types.ts`) |
| `transport/` | No barrel: `createDockerTransport()`, the `IExecTransport` over the Docker exec API (demuxed streams into the workspace's sinks, exit code by inspect poll, `alive` by container inspect) |

## Kubernetes Sandbox Module Map (`packages/sandbox-k8s/src`)

| Path | Purpose |
|------|---------|
| `provider/` | `createKubernetesSandbox()` (`module.ts`), `buildPod()`, `podState()`, `assertKubernetesOptions()`, `loadDefaultKubeConfig()` (`helpers.ts`, internal), `CONTAINER_NAME`, `POD_NAME_PREFIX`, `START_TIMEOUT_MS`, `POLL_MS`, `FATAL_WAITING_REASONS` (`constants.ts`), `KubernetesSandboxOptions` (`types.ts`) |
| `client/` | `createPodClient()` (`module.ts`), `createPodClientFrom()` (`helpers.ts`, the test seam over `core`/`exec`), `IPodClient` and parts (`types.ts`), `STDIN_CLOSE_PROTOCOL` (`v5.channel.k8s.io`) |
| `transport/` | No barrel: `createPodTransport()`, the `IExecTransport` over `IPodClient.exec` (`alive` by pod read) |

## Coding Module Map (`packages/coding/src`)

| Path | Purpose |
|------|---------|
| `tools/` | `codingTools()` (`module.ts`); `read_file`, `write_file`, `edit_file` (`files.ts`), `grep`, `list_files` (`search.ts`), `bash` (`shell.ts`), `git_diff` (`git.ts`); input checks, `workspaceOf()`, `objectSchema()` (`helpers.ts`); `READ_MAX_LINES`, `READ_MAX_CHARS`, `SEARCH_MAX_RESULTS`, `LIST_MAX_RESULTS`, `LINE_MAX_CHARS` (public) and defaults (`constants.ts`); result types (`types.ts`) |
| `backend/` | `ICodingBackend`, `CodingTask`, `CodingResult`, `CodingBudget` (types only) |

## App Module Map (`packages/app/src`)

| Path | Purpose |
|------|---------|
| `app/` | `createApp()`, `isApp()` and the `App` class (`module.ts`, the lifecycle: one orkos `Application` over a fresh eldin `Container` per `start`/`runJob`/`migrate`, memoized `stop()`), `buildModules()` (built-ins replaced by name, duplicate names refused), `toSetupError()` (orkos graph errors as `InvalidAgentDefinitionError`), `createInUseError()`, `createStopFailedError()` (`helpers.ts`), `APP_BRAND` (`constants.ts`), `AppOptions`, `IApp` and the lifecycle option/result types (`types.ts`) |
| `module/` | `AppToken`, `ModuleName`, `AUTHENTICATOR_ORDER`, `APP_ERROR_CODE` (`constants.ts`), `runHooks()`, `throwIfStopped()`, `reportingModule()`, `createStoppedError()` (`helpers.ts`, the last two internal), `registerStartStep()`, `runStartSteps()` (`start.ts`, internal: the engine and scheduler starts, run once every `onReady` built), `AppContext`, `ILifecycleHook`, `AuthenticatorEntry`, `Server`, `AppTokens` and the re-exported orkos `IModule` and eldin `IContainer` types (`types.ts`); with the env readers and `approvalUrlOf()` the module contract feature packages import from the main entry |
| `env/` | `TIMER_MAX_MS` (`constants.ts`), `envString()`, `envInteger()`, `envBoolean()`, `envUrl()`, `envList()`, `envJson()`, `envOneOf()` (`module.ts`, never echoing a value), `Env` and the reader options (`types.ts`) |
| `config/` | `readConfig(env, { mode, dev })` (`module.ts`), `readTokens()`, `approvalUrlOf()` (`helpers.ts`), defaults and patterns (`constants.ts`), `AppConfig`, `LogLevel`, `ReadConfigOptions`, `ApprovalRef` (`types.ts`) |
| `logger/` | `createLogger()` (`module.ts`, JSON lines on stderr), `serializeError()`, `toLine()` (`helpers.ts`), `LOG_LEVEL_RANK` |
| `models/` | `createModelRegistry()`, `installDefaultProvider()` (`module.ts`), `isPackageNotFound()`, `defaultImporter()` (`helpers.ts`), `BUILTIN_PROVIDERS`, `MODEL_SEPARATOR` (`constants.ts`) |
| `core/` | The re-export of `@chamvi/core` and named `@chamvi/http` symbols (the documented exception, see conventions) |
| `modules/` | The built-ins, one folder each: `config/`, `store/` (`purge.ts` the purge timer, `maskPassword()`, `destroyQuietly()`, `isPurgingStore()` in `helpers.ts`), `static-tokens/` (the dev `*` token), `engine/`, `scheduler/`, `http/` (`resolveAuthenticators()` in `helpers.ts`), `console-notifier/` |
| `authup/` | The `/authup` entry: `authupModule()` (`module.ts`), `oidcModule()` (`oidc.ts`), `*_MODULE_NAME` and the options types (they stay here: moving them to `@chamvi/http` would make http depend on app, a cycle) |
| `testing/` | The `/testing` entry: `buildModuleHarness()`, `createModuleHarness()` (`module.ts`, the real module lifecycle over the given modules: `reportingModule()`, `runStartSteps()`), `ModuleHarness`, `ModuleHarnessOptions`, `ModuleHarnessReport` (`types.ts`) |

## CLI Module Map (`packages/cli/src`)

| Path | Purpose |
|------|---------|
| `cli.ts` | The bin: `await runCli(process.argv.slice(2), processContext(fileURLToPath(import.meta.url)))` |
| `run/` | `runCli()` (`module.ts`: `--help`/`--version`, citty `runCommand`, errors to stderr with `exitCodeOf`), `processContext()`, `exitCodeOf()`, `createUsageError()`, `assertKnownArgs()`, `messageOf()`, `isRecord()` (`helpers.ts`), `EXIT_CODE`, `CLI_USAGE_ERROR_CODE` (public), `CITTY_ERROR_NAME`, `USAGE_ERROR_CODES`, `APP_STOPPED_ERROR_CODE` (`constants.ts`), `CliContext` (`types.ts`) |
| `commands/` | `createMainCommand()` (`module.ts`), one file per command (`dev.ts`, `build.ts`, `start.ts`, `run-job.ts`, `migrate.ts`), `readVersion()`, `loadDotEnv()` (`helpers.ts`, `node:util` `parseEnv`), `FORCE_EXIT_MS`, `DEV_FORCE_EXIT_MS`, `DEV_LINK_VARIABLE`, `BUILD_OUT_DIR`, `BUILD_OUTPUT_PATTERN`, `TSDOWN_PACKAGE`, ... (`constants.ts`) |
| `entry/` | `resolveEntry()` (`--entry`, `package.json` `chamvi.entry` for source commands only, `SOURCE_ENTRY`/`BUILT_ENTRY`), `loadApp()` (`isApp` check) (`module.ts`), `EntryKind`, `ResolveEntryInput` (`types.ts`); not re-exported from the main entry |
| `signals/` | `installSignalHandlers()` (`module.ts`: first signal stops, a second one at least `SIGNAL_REPEAT_MS` (`constants.ts`, 1 s) later exits 1, the force-exit timer on the `IClock`, kept alive), `ISignalTarget` (public), `ProcessEvent`, `StopSignal`, `SignalHandlersInput`, `SignalHandlers` (`types.ts`) |

## Store-TypeORM Module Map (`packages/store-typeorm/src`)

| Path | Purpose |
|------|---------|
| `entities/` | One TypeORM entity per table, the repositories the store queries through; `TableName` and the jsonb transformers (`JSON_VALUE_TRANSFORMER`, `OPTIONAL_JSON_TRANSFORMER`) in `constants.ts`, `toJsonParameter()` (jsonb sanitizing) in `helpers.ts` |
| `migrations/` | `1792195200000-init.ts` (`Init1792195200000`), `1792368000000-artifacts.ts` (table `chamvi_artifacts`), generated from the entities; `1792454400000-idempotency-scope.ts` (`scope` varchar(1024), hand-written), `1792540800000-kv-key-collation.ts` (`chamvi_kv.key` `COLLATE "C"`, hand-written) |
| `schema/` | `migrateStore()` (`module.ts`), `STORE_ENTITIES`, `STORE_MIGRATIONS`, `MIGRATION_LOCK_NAME` |
| `store/` | `TypeormStore` (`module.ts`), entity to domain mapping, value builders and `RETURNING` row hydration (`helpers.ts`), `TypeormStoreOptions`, `PurgeResult` |

## UI Module Map (`packages/ui`)

| Path | Purpose |
|------|---------|
| `src/config/` | `UiConfig`, `UiAuthupConfig` (`types.ts`), `CONFIG_ELEMENT_ID` (public), `CONFIG_MARKER` (`constants.ts`); shared with the SPA as types and constants |
| `src/routes/` | `uiRoutes()` (`module.ts`), `resolveBuildPath()`, `loadBuild()`, `renderIndex()`, `buildCsp()`, `defaultRoot()`, `isFileLike()` (`helpers.ts`, internal), `DEFAULT_UI_BASE_PATH`, `ASSET_CACHE_CONTROL`, `DOCUMENT_CACHE_CONTROL` (public), `BUILD_RETRY_MS`, `MEDIA_TYPES`, `SECURITY_HEADERS`, `UI_BASE_PATH_PATTERN` (`constants.ts`), `UiRoutesOptions`, `BuildFile` (`types.ts`) |
| `src/module/` | The `/module` entry (the only folder importing `@chamvi/app`): `uiModule()`, `UiModule` (`module.ts`), `readAuth()` (`helpers.ts`), `UI_MODULE_NAME` (`constants.ts`), `UiModuleOptions` (`types.ts`) |
| `app/` | The SPA: `main.ts` (install order: icons, authup when configured, vuecs, component plugins, router), `App.vue`, `style.css` (Crimson tokens and classes of the approved mockup version 3, light and dark), `index.html` (with `CONFIG_MARKER`), `shims.d.ts`, `tsconfig.json` (vue-tsc, also checks `test/unit/app`) |
| `app/config/` | `readConfig()`, `DEV_CONFIG` |
| `app/router/` | `createUiRouter()`, `RouteName` |
| `app/context/` | `AppContext` (config, client, session, storage), `APP_CONTEXT`, `useAppContext()` |
| `app/api/` | `createApiClient()`, `ApiError` (`error.ts`), query and error helpers (`toApiError()` for a response, `asApiError()` for any thrown value, `retryDelayOf()` for a 429/503, `helpers.ts`), `RATE_LIMIT_BACKOFF_MS` (`constants.ts`), wire types (`Wire<T>`, `RunWire`, `IApiClient`, ...) |
| `app/sse/` | `openRunStream()`, `parseEventStream()`, `sleep()`, `RECONNECT_DELAYS_MS` |
| `app/auth/` | `createSession()`, `createAuthGuard()` (`guard.ts`), `createAuthupAdapter()` (`authup.ts`, lazily imported), `hasPermission()`, `safeReturnPath()`, `clearStorage()`, `createSessionCookies()` (`helpers.ts`), storage keys |
| `app/polling/` | `createPoller()`, `documentVisibility()` (`helpers.ts`), `IPageVisibility` |
| `app/runs/` | `useRunList()`, `useRunCounts()`, `useRunActivity()`, `useRunDetail()` (`composables.ts`), `mergeRunEvent()`, `canCancel()`, formatters (`helpers.ts`), route-query mapping (`query.ts`), constants |
| `app/approvals/` | `useApprovals()`, `useDeepLinkApproval()`, `decodeResumeToken()`, `stripResumeToken()`, `readResumeToken()`, `pendingApprovals()`, `RESUME_STORAGE_KEY`, `INBOX` |
| `app/agents/` | `useAgents()`, `useAgentRollups()` (overview), `useAgentDetail()` (agent page, `start()`) (`composables.ts`); `triggerChips()`, `summarizeActivity()`, `buildRollups()`, `activityLabel()`, `createStartKeys()`, `newIdempotencyKey()`, `failedSummary()`, `tokenShares()`, `nextFireOf()`, `lastRunOf()`, `oldestWaiting()`, `hasHttpTrigger()`, `matchesName()`, `parsePayload()`, `formatBudgetTime()` (`helpers.ts`); `ACTIVITY_WINDOW_MS`, `ACTIVITY_LIMIT`, `ACTIVE_LIMIT`, `AGENTS_POLL_MS`, `RECENT_RUNS`, `AGENT_WAITING_LIMIT` (`constants.ts`); `TriggerChip`, `Activity`, `AgentRollup` (`types.ts`) |
| `app/state/`, `app/schedules/` | `useAgentState()`, `useSchedules()` and their helpers (`describeCron()` in `schedules/helpers.ts`) |
| `app/components/` | One folder per component: `app-shell`, `brand-logo`, `nav-icon` (`IconName`, the mockup's glyphs), `page-head`, `empty-state`, `status-chip`, `trigger-chip`, `json-block`, `step-item`, `usage-meter`, `approval-callout`, `expiry-countdown`, `runs-table`, `schedule-card`, `activity-strip`, `agent-card`, `agent-runs`, `agent-state` (`AgentStatePanel`), `start-run` (`StartRunModal`), `tab-list` (`TabList`, the ARIA tabs pattern: roving tabindex, arrow keys, `tabForKey()`) |
| `app/views/` | `LoginView`, `LoginCallbackView`, `AgentsView`, `AgentView`, `RunsView`, `RunView`, `ApprovalsView`, `SchedulesView` |
| `vite.config.ts` | Root `app`, out `dist/app`, `base: './'` for the build, the dev proxy to port 3000, the `virtual:chamvi-icons` plugin |
| `test/e2e/` | `smoke.spec.ts` (Playwright), `demo/` (`server.ts`, `model.ts`, `constants.ts`) |
