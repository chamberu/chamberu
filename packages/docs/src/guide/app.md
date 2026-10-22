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
    "extends": "@tada5hi/tsconfig",
    "compilerOptions": {
        "allowImportingTsExtensions": true,
        "erasableSyntaxOnly": true,
        "noEmit": true
    }
}
```

## Model strings

An agent's `model` may be a string `'<provider>:<model>'`. It resolves through an AI SDK provider registry of every installed provider package (`@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`, `@ai-sdk/mistral`, `@ai-sdk/xai`) with its key from env (`ANTHROPIC_API_KEY`, ...), overridden per provider by `createApp({ models })`. `start` and `runJob` check every string model first: a provider package that is not installed or a key that is not set throws `InvalidAgentDefinitionError` naming the package or the variable, and the CLI exits 2. A string never reaches the Vercel Gateway. A `LanguageModel` object is used as is.

## Modules

Modules are [orkos](https://github.com/tada5hi/orkos) `IModule`s on an [eldin](https://github.com/tada5hi/eldin) container, unwrapped. Six built-in modules are always there; listing a module with a built-in's name (`ModuleName`) replaces it, which is also how you configure one (`storeModule({ dataSource })`, `httpModule({ cors })`). Two modules sharing any other name throw `InvalidAgentDefinitionError` from `createApp`.

| Module | Does |
|---|---|
| `configModule()` | Reads every variable once ([environment](/reference/app#environment)) and registers the config, the clock and the JSON line logger |
| `storeModule()` | A `TypeormStore` over `DATABASE_URL`, migrated unless `CHAMVI_MIGRATE=false`, plus the hourly `purgeExpired()`; without `DATABASE_URL` a `MemoryStore` (warned outside dev) |
| `staticTokensModule()` | The `staticTokens()` authenticator from `CHAMVI_TOKENS` |
| `engineModule()` | Checks the model strings, builds the `Engine` with every contributed notifier and starts it |
| `schedulerModule()` | The in-process cron scheduler; `CHAMVI_SCHEDULER=false` leaves cron to Kubernetes CronJobs and `chamvi run-job` |
| `httpModule()` | `createHttpApp()` with every contributed route and authenticator, the graceful shutdown, `serve()` on `HOST`:`PORT` |

The optional modules live on subpath entries, so the main entry never imports their packages; install the peer packages of the ones you use. Each factory reads its variables **when it is called**, that is when the entry is imported, and exposes its instance at once, so tools and triggers can use it in the agent definitions:

<<< @/snippets/app-modules.ts#modules

| Factory | Entry | Contributes |
|---|---|---|
| `githubModule()` | `@chamvi/app/github` | `.app` (`IGithubApp`), the signed webhook route `/webhooks/github` |
| `githubNotifierModule({ app })` | `@chamvi/app/github` | the `githubNotifier()` named `github` |
| `sandboxModule()` | `@chamvi/app/sandbox` | `.manager` (`IWorkspaceManager`), attached on start, closed after the engine drained |
| `openclawModule()` | `@chamvi/app/openclaw` | the `openclaw()` notifier named `openclaw` |
| `uiModule()` | `@chamvi/app/ui` | the [dashboard](/guide/ui) at `<basePath>/ui` |
| `authupModule()`, `oidcModule(options)` | `@chamvi/app/authup` | the `authup()` and `oidc()` authenticators, after the static tokens |
| `consoleNotifierModule()` | `@chamvi/app` | the `consoleNotifier()` named `console` |

With `CHAMVI_PUBLIC_URL` set, the notifier modules link approvals to the dashboard: `<CHAMVI_PUBLIC_URL><basePath>/ui/approvals?run=<runId>&approval=<approvalId>`, without a token. A factory missing a required variable throws `InvalidAgentDefinitionError` naming it; no message ever echoes a value.

## Setup contributes, onReady consumes

orkos sets every module up in dependency order, then calls every `onReady`. chamvi splits the work along that line:

- In **`setup`**, a module registers what it contributes on the container's collection tokens: `AppToken.HTTP_ROUTES`, `NOTIFIERS`, `AUTHENTICATORS` (with an `order`, lowest first) and `LIFECYCLE_HOOKS`.
- In **`onReady`**, the consumers build: the engine module collects the notifiers, the http module the routes and authenticators.

So a contribution never depends on module order. A module that resolves `ENGINE`, `SCHEDULER` or `SERVER` in its own `onReady` lists that module in `dependencies`.

## Start and stop

`app.start()` resolves once the server listens, so `/readyz` turns green only after everything runs:

1. config
2. store (and the migrations, advisory-locked, so every replica may run them)
3. `engine.start()`
4. `scheduler.start()`
5. the purge timer
6. `serve()` on `HOST`:`PORT`, listening last

`app.stop()` is memoized and also stops a start still setting up (which then never listens):

1. `/readyz` answers 503, then `CHAMVI_READINESS_DELAY_MS` (0)
2. `scheduler.stop()` and the purge timer stop
3. the app's closers (SSE streams, MCP waits)
4. `server.close()`
5. `engine.drain()` for up to `CHAMVI_DRAIN_TIMEOUT_MS` (30 s)
6. up to `CHAMVI_CLOSE_TIMEOUT_MS` (5 s) for the close, then `server.close(true)`
7. the workspace manager closes (with `sandboxModule`, up to 30 s)
8. the store's data source is destroyed

orkos swallows teardown errors; chamvi does not: every teardown error is logged, and `stop()` then rejects with `app_stop_failed` (the CLI exits 1). An app runs one lifecycle: a second `start()`, `runJob()` or `migrate()` rejects with `app_in_use`.

`runJob({ agent, trigger? })` builds config, store and engine, no scheduler and no HTTP, fires the cron trigger once through [`runJob()`](/guide/scheduler) and tears down. `migrate()` only migrates the store; it fails without `DATABASE_URL`.

## Writing a module

<<< @/snippets/app-module.ts#module

- **Hooks** (`LIFECYCLE_HOOKS`): `engineCreated(engine)` before `engine.start()`, `started()` before the server listens, `stopping()` after the scheduler stopped, `drained()` after the engine drained and before the store closes.
- **Failures:** orkos never tears down a module whose `setup` threw, so such a `setup` closes what it opened before rethrowing. A module whose `onReady` threw is torn down, so `teardown` tolerates state that `onReady` never built.
- **Stopping:** `AppToken.CONTEXT` holds the lifecycle's `signal`, aborted once `stop()` is called; `throwIfStopped(context)` before a long step keeps a stopped start from going on. `context.report(error)` logs an error and, during `stop()`, makes it reject.
- **Names:** a module name is a plain string (`'audit'`); never an npm package name, since orkos would try to `import()` it.

## Testing an app

`start({ env })` takes the environment instead of `process.env` for the built-in modules, and `models` replaces a provider, so an app runs in a test without keys or network:

<<< @/snippets/app-testing.ts#testing

The optional module factories read `options.env ?? process.env` when they are called, never `start({ env })`: configure them in a test through their own `env` option, for example `githubModule({ env: { GITHUB_APP_ID: '1', ... } })`.

## Read next

- [`@chamvi/app` reference](/reference/app): every factory, option, token and variable
- [`@chamvi/cli` reference](/reference/cli): commands, exit codes, signals and `dev`
- [Deployment](/deployment/): the image, chart and template built on the CLI
