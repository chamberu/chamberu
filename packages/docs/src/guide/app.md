# Apps & Modules

An agent repository is one entry file: `export default createApp({ agents, modules })`. [`@chamvi/app`](/reference/app) boots config, store, engine, scheduler and HTTP from environment variables and shuts them down in order; [`@chamvi/cli`](/reference/cli) turns that into a process with `chamvi dev | build | start | run-job | migrate`, signals and exit codes.

```bash
npm install @chamvi/app @chamvi/cli ai @ai-sdk/anthropic typeorm pg
npm install --save-dev tsdown   # only for chamvi build
```

`@chamvi/app` is a library without process concerns: it registers no signal handlers, never calls `process.exit` and reads no argv. Everything about the process lives in the CLI.

## The entry

<<< @/snippets/app.ts#entry

- The entry is `src/index.ts`. `dev`, `build` and `start --dev` take `--entry`, else the `package.json` field `"chamvi": { "entry": "<path>" }`, else `src/index.ts`. The built commands (`start`, `run-job`, `migrate`) default to `dist/index.mjs` and never read that field.
- `createApp()` is synchronous and side-effect free: no env read, no I/O, no provider import. Everything happens in `start()`, `runJob()` and `migrate()`, which the CLI calls.
- An entry whose default export is not an app (checked with `isApp()`, which also recognizes an app of another installed copy) makes the CLI exit 2.
- `@chamvi/app` re-exports `@chamvi/core` and the common part of `@chamvi/http` (`agentPermission`, `Permission` and the `Authenticator`, `Principal`, `HttpRoute*`, `StaticToken` types), so an agent repository imports one package.

`dev` runs the source through Node's type stripping and `build` bundles it with tsdown, so the code has to suit both: relative imports carry `.ts` and there is no `enum`. The template `tsconfig.json`:

```json
{
    "compilerOptions": {
        "target": "ES2023",
        "module": "NodeNext",
        "moduleResolution": "NodeNext",
        "strict": true,
        "skipLibCheck": true,
        "verbatimModuleSyntax": true,
        "allowImportingTsExtensions": true,
        "erasableSyntaxOnly": true,
        "noEmit": true
    },
    "include": ["src", "test"]
}
```

## Model strings

An agent's `model` may be a string `'<provider>:<model>'`. It resolves through an AI SDK provider registry of every installed provider package (`@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`, `@ai-sdk/mistral`, `@ai-sdk/xai`) with its key from env (`ANTHROPIC_API_KEY`, ...), overridden per provider by `createApp({ models })`. `start` and `runJob` check every string model first: a provider package that is not installed or a key that is not set throws `InvalidAgentDefinitionError` naming the package or the variable, and the CLI exits 2. A string never reaches the Vercel Gateway. A `LanguageModel` object is used as is.

## Modules

Modules are [orkos](https://github.com/tada5hi/orkos) `IModule`s on an [eldin](https://github.com/tada5hi/eldin) container, unwrapped. Seven built-in modules are always there; listing a module with a built-in's name (`ModuleName`) replaces it, which is also how you configure one (`storeModule({ dataSource })`, `httpModule({ cors })`). Two modules of one name, a built-in's included, throw `InvalidAgentDefinitionError` from `createApp`.

| Module | Does |
|---|---|
| `configModule()` | Reads every variable once ([environment](/reference/app#environment)) and registers the config, the clock and the JSON line logger |
| `storeModule()` | A `TypeormStore` over `DATABASE_URL`, migrated unless `CHAMVI_MIGRATE=false`, plus the hourly `purgeExpired()`; without `DATABASE_URL` a `MemoryStore` (warned outside dev) |
| `staticTokensModule()` | The `staticTokens()` authenticator from `CHAMVI_TOKENS` |
| `engineModule()` | Checks the model strings, builds the `Engine` with every contributed notifier and starts it |
| `agentsModule()` | Without `CHAMVI_AGENTS_DIR`, refuses an app without agents; with it, loads the [agent folders](/guide/agent-folders) before the engine starts and watches them |
| `schedulerModule()` | The in-process cron scheduler; `CHAMVI_SCHEDULER=false` leaves cron to Kubernetes CronJobs and `chamvi run-job` |
| `httpModule()` | `createHttpApp()` with every contributed route and authenticator, the graceful shutdown, `serve()` on `HOST`:`PORT` |

The optional modules ship with the package they configure, on its `/module` subpath (`@chamvi/app` is an optional peer there, and the package's main entry never imports it), so install the feature package of each one you use. Each factory reads its variables **when it is called**, that is when the entry is imported, and exposes its instance at once (`.app`, `.manager`). Each module also **provides its instance on the engine** before it starts, so a tools factory injects it per execution with the package's `inject*Context(ctx)` (see [Context](/guide/tools#context-shared-instances-for-tools)):

<<< @/snippets/app-modules.ts#modules

| Factory | Entry | Contributes | Context |
|---|---|---|---|
| `githubModule()` | `@chamvi/github/module` | `.app` (`IGithubApp`), the signed webhook route `/webhooks/github` | `injectGithubContext(ctx)` |
| `githubNotifierModule({ app })` | `@chamvi/notify-github/module` | the `githubNotifier()` named `github` | `injectGithubNotifierContext(ctx, name?)` |
| `sandboxModule()` | `@chamvi/sandbox/module` | `.manager` (`IWorkspaceManager`), attached on start, closed after the engine drained | `injectSandboxContext(ctx)` |
| `openclawModule()` | `@chamvi/notify-openclaw/module` | the `openclaw()` notifier named `openclaw` | `injectOpenclawContext(ctx, name?)` |
| `uiModule()` | `@chamvi/ui/module` | the [dashboard](/guide/ui) at `<basePath>/ui` | |
| `authupModule()`, `oidcModule(options)` | `@chamvi/app/authup` | the `authup()` and `oidc()` authenticators, after the static tokens | |
| `consoleNotifierModule()` | `@chamvi/app` | the `consoleNotifier()` named `console` | |

The notifier contexts are keyed per notifier name, so `openclawModule()` beside `openclawModule({ name: 'ops' })` provides both (`injectOpenclawContext(ctx, 'ops')`). `@chamvi/app/authup` stays in the app package, since `@chamvi/http` cannot depend on `@chamvi/app`.

With `CHAMVI_PUBLIC_URL` set, the notifier modules link approvals to the dashboard: `<CHAMVI_PUBLIC_URL><basePath>/ui/approvals?run=<runId>&approval=<approvalId>`, without a token. A factory missing a required variable throws `InvalidAgentDefinitionError` naming it; no message ever echoes a value.

## Setup contributes, onReady consumes

orkos sets every module up in dependency order, then calls every `onReady`. chamvi splits the work along that line:

- In **`setup`**, a module registers what it contributes on the container's collection tokens: `AppToken.HTTP_ROUTES`, `NOTIFIERS`, `AUTHENTICATORS` (with an `order`, lowest first) and `LIFECYCLE_HOOKS`.
- In **`onReady`**, the consumers build: the engine module collects the notifiers, the http module the routes and authenticators.

So a contribution never depends on module order. A module that resolves `ENGINE`, `SCHEDULER` or `SERVER` in its own `onReady` lists that module in `dependencies`. Nothing starts in `onReady`: the engine, the scheduler and the http module register start steps, which the app runs (engine, scheduler, then the `started` hooks and listening) only once every module's `onReady` ran, user modules included. So a configuration error any of them finds starts nothing: no queued run of the shared store executes on a replica that then exits 2.

## Start and stop

`app.start()` resolves once the server listens, so `/readyz` turns green only after everything runs:

1. config
2. store (and the migrations, advisory-locked, so every replica may run them)
3. every `onReady`: the engine is built, the [agent folders](/guide/agent-folders) are loaded into it, the scheduler and the HTTP app are built, nothing runs yet
4. `engine.start()`
5. `scheduler.start()`
6. the purge timer and the agents dir watcher
7. `serve()` on `HOST`:`PORT`, listening last

`app.stop()` is memoized and also stops a start still setting up (which then never listens):

1. `/readyz` answers 503, then `CHAMVI_READINESS_DELAY_MS` (0)
2. `scheduler.stop()`, the purge timer and the agents dir watcher stop
3. the app's closers (SSE streams, MCP waits)
4. `server.close()`
5. `engine.drain()` for up to `CHAMVI_DRAIN_TIMEOUT_MS` (30 s)
6. up to `CHAMVI_CLOSE_TIMEOUT_MS` (5 s) for the close, then `server.close(true)`
7. the workspace manager closes (with `sandboxModule`, up to 30 s)
8. the store's data source is destroyed

orkos swallows teardown errors; chamvi does not: every teardown error is logged, and `stop()` then rejects with `app_stop_failed` (the CLI exits 1). An app runs one lifecycle: a second `start()`, `runJob()` or `migrate()` rejects with `app_in_use`.

`runJob({ agent, trigger? })` builds config, store and engine (with the folder agents, loaded once), no scheduler and no HTTP, fires the cron trigger once through [`runJob()`](/guide/scheduler) and tears down. `migrate()` only migrates the store; it fails without `DATABASE_URL`.

## Writing a module

The module contract comes from the main entry of `@chamvi/app`: `AppToken`, `ModuleName`, `AppContext`, `ILifecycleHook`, the env readers and the orkos `IModule` and eldin `IContainer` types, so a module needs no direct orkos or eldin import. A module that shares an instance with tools provides it in the `engineCreated` hook and exports an `inject*` function next to it, keeping its key internal:

<<< @/snippets/app-module.ts#module

- **Hooks** (`LIFECYCLE_HOOKS`): `engineCreated(engine)` before `engine.start()` (the place for `engine.provide()`; a throwing hook, such as a second value for one key, is logged through `context.report()` and the app still starts), `started()` before the server listens, `stopping()` after the scheduler stopped, `drained()` after the engine drained and before the store closes.
- **Failures:** orkos never tears down a module whose `setup` threw, so such a `setup` closes what it opened before rethrowing. A module whose `onReady` threw is torn down, so `teardown` tolerates state that `onReady` never built.
- **Stopping:** `AppToken.CONTEXT` holds the lifecycle's `signal`, aborted once `stop()` is called; `throwIfStopped(context)` before a long step keeps a stopped start from going on. `context.report(error)` logs an error and, during `stop()`, makes it reject.
- **Modes:** `AppToken.CONTEXT` holds the `mode`: `start` builds everything, `job` (`runJob`) config, store and engine, `migrate` only config and store. A module that resolves `ENGINE` in `onReady` returns early in `migrate` mode, as the sample does, or `chamvi migrate` fails.
- **Testing:** `createModuleHarness({ modules, env?, agents?, clock? })` from `@chamvi/app/testing` runs the real module lifecycle (setup, `onReady`, the start steps) of the modules you list, built-ins included, without `start()` and a port: `harness.container` resolves what a module contributed, `harness.reported` holds every `context.report()` call, `harness.stop()` tears down. The feature packages test their own modules with it.
- **Dependencies:** `dependencies` name modules the app registers (`{ name, optional: true }` for one it may lack). A missing one, a cycle or a version mismatch throws `InvalidAgentDefinitionError` from `start`, `runJob` and `migrate` before any module set up (the CLI exits 2).

## Testing an app

`start({ env })` takes the environment instead of `process.env` for the built-in modules, and `models` replaces a provider, so an app runs in a test without keys or network:

<<< @/snippets/app-testing.ts#testing

The optional module factories read `options.env ?? process.env` when they are called, never `start({ env })`: configure them in a test through their own `env` option, for example `githubModule({ env: { GITHUB_APP_ID: '1', ... } })`.

## Read next

- [`@chamvi/app` reference](/reference/app): every factory, option, token and variable
- [`@chamvi/cli` reference](/reference/cli): commands, exit codes, signals and `dev`
- [Deployment](/deployment/): the image, chart and template built on the CLI
