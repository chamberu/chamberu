<p align="center">
    <img src="https://raw.githubusercontent.com/chamvi/chamvi/master/.github/assets/logo.svg" alt="@chamvi/app" width="128" height="128" />
</p>

<h1 align="center">@chamvi/app</h1>

<p align="center">
    <b>Boots chamvi agents as an app: config, store, engine, scheduler and HTTP as orkos modules.</b><br>
    An agent repository is one <code>createApp()</code> default export;<br>
    <code>chamvi start | run-job | migrate</code> (<a href="https://www.npmjs.com/package/@chamvi/cli">@chamvi/cli</a>) runs it.
</p>

<p align="center">
    <a href="https://www.npmjs.com/package/@chamvi/app"><img src="https://img.shields.io/npm/v/@chamvi/app" alt="npm version" /></a>
    <a href="https://github.com/chamvi/chamvi/actions/workflows/ci.yml"><img src="https://github.com/chamvi/chamvi/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="https://github.com/chamvi/chamvi/blob/master/packages/app/LICENSE"><img src="https://img.shields.io/npm/l/@chamvi/app" alt="License" /></a>
</p>

---

**Table of Contents**
- [Installation](#installation)
- [Usage](#usage)
- [Environment](#environment)
- [Modules](#modules)
- [Lifecycle](#lifecycle)
- [Writing a module](#writing-a-module)
- [Models](#models)
- [License](#license)

## Installation

```bash
npm install @chamvi/app @chamvi/cli ai @ai-sdk/anthropic typeorm pg
```

ESM only, Node.js `>=22`. `ai`, `typeorm` and `pg` are peer dependencies; the provider packages (`@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`, `@ai-sdk/mistral`, `@ai-sdk/xai`) and the packages behind the optional modules are optional peers: install the ones you use.

The main entry re-exports `@chamvi/core` and the common part of `@chamvi/http` (`agentPermission`, `Permission`, the `Authenticator`, `Principal`, `HttpRoute*` and `StaticToken` types), so an agent repository imports one package.

## Usage

`src/index.ts` exports the app as its default export:

```typescript
import {
    consoleNotifierModule,
    createApp,
    cron,
    defineAgent,
    http,
} from '@chamvi/app';

const triage = defineAgent({
    name: 'triage',
    // resolved through the installed provider package (@ai-sdk/anthropic, ANTHROPIC_API_KEY)
    model: 'anthropic:claude-sonnet-5-5',
    instructions: 'Triage the reported issue: label it and summarize the next step.',
    triggers: [
        // POST /agents/triage/runs, the UI and MCP
        http(),
        // every 30 minutes, Berlin time
        cron('*/30 * * * *', { timezone: 'Europe/Berlin' }),
    ],
    notify: 'console',
});

// chamvi start | run-job | migrate load this default export
export default createApp({
    agents: [triage],
    modules: [consoleNotifierModule()],
});
```

`createApp()` is synchronous and side-effect free: no env read, no I/O. Everything happens in the lifecycle methods, which the CLI calls:

| Method | CLI | Does |
|---|---|---|
| `start({ env?, dev? })` | `chamvi start` | sets every module up, resolves once the HTTP server listens |
| `stop()` | first SIGTERM or SIGINT | memoized; aborts a start still setting up, tears every module down |
| `runJob({ agent, trigger?, env? })` | `chamvi run-job <agent> [trigger]` | fires one cron trigger once and waits for its run (no scheduler, no HTTP); `{ runId?, status, exitCode }` |
| `migrate({ env? })` | `chamvi migrate` | migrates the store (`DATABASE_URL` required) and closes it |

`env` defaults to `process.env`. An app runs one lifecycle; a second one rejects with `app_in_use`. `isApp(value)` recognizes an app, also one of another installed copy of the package.

## Environment

Every variable is read once per lifecycle. An empty string counts as unset, integers are digits only, booleans `true`, `false`, `1` or `0`. A malformed value throws `InvalidAgentDefinitionError` naming the variable, never echoing its value.

| Variable | Read by | Value | Default |
|---|---|---|---|
| `PORT` | http | int 1..65535 | `3000` |
| `HOST` | http | string | `0.0.0.0` |
| `CHAMVI_BASE_PATH` | http | empty or `^(?:\/[a-z0-9._~-]+)+$` | `''` (health at `/healthz`, UI at `/ui`) |
| `CHAMVI_PUBLIC_URL` | ui, notifiers | absolute URL | unset; set it for approval links (`<url><basePath>/ui/approvals?run=<runId>&approval=<approvalId>`) |
| `CHAMVI_LOG_LEVEL` | config | `error`, `warn`, `info`, `debug` | `info` |
| `DATABASE_URL` | store | `postgres://...` | unset: `MemoryStore` (warned outside `--dev`); required for `migrate` and any multi-replica or CronJob deployment |
| `CHAMVI_MIGRATE` | store | bool | `true` (`start` and `run-job` migrate, advisory-locked) |
| `CHAMVI_PURGE_INTERVAL_MS` | store | int, `0` disables | `3600000` (only with `TypeormStore`) |
| `RESUME_SECRET` | engine | at least 32 characters | required for `start` and `run-job` (`--dev`: random per process, warned) |
| `CHAMVI_MAX_CONCURRENT_RUNS` | engine | int >= 1 | `4` |
| `CHAMVI_SCHEDULER` | scheduler | bool | `true`; `false` runs no in-process cron (CronJob mode) |
| `CHAMVI_READINESS_DELAY_MS` | http shutdown | int | `0` |
| `CHAMVI_DRAIN_TIMEOUT_MS` | http shutdown | int | `30000` (`--dev` 5000) |
| `CHAMVI_CLOSE_TIMEOUT_MS` | http shutdown | int | `5000` |
| `CHAMVI_TOKENS` | static tokens | JSON `[{ "value", "id", "permissions": [] }]`, `value` at least 16 characters and unique | unset (`--dev`: one random `*` token, warned); required when no other authenticator is configured |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `MISTRAL_API_KEY`, `XAI_API_KEY` | models | string | unset; required when a model string names that provider (see [Models](#models)); `ANTHROPIC_BASE_URL`, `OPENAI_BASE_URL` are passed on |
| `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` (PEM, literal `\n` allowed), `GITHUB_WEBHOOK_SECRET` (comma-separated for rotation) | `githubModule` | string | required without options |
| `GITHUB_INSTALLATION_ID`, `GITHUB_APP_SLUG`, `GITHUB_API_URL` | `githubModule` | int, slug, https URL | unset |
| `OPENCLAW_BASE_URL`, `OPENCLAW_HOOKS_TOKEN`, `OPENCLAW_CHANNEL`, `OPENCLAW_TO` | `openclawModule` | URL, string, string, string | required without options |
| `OPENCLAW_HOOKS_PATH`, `OPENCLAW_AGENT_ID`, `OPENCLAW_ACCOUNT_ID` | `openclawModule` | string | `/hooks`, unset, unset |
| `AUTHUP_URL`, `AUTHUP_CLIENT_ID`, `AUTHUP_CLIENT_SECRET` | `authupModule` | URL, string, string | required without a `verifier` |
| `CHAMVI_UI_AUTHUP_CLIENT_ID`, `CHAMVI_UI_AUTHUP_REALM_ID` | `uiModule` | string | unset (token login only); the authup login then needs `AUTHUP_URL` |
| `CHAMVI_SANDBOX_PROVIDER` | `sandboxModule` | `local`, `docker`, `kubernetes` | the `provider` option, else `local` |
| `CHAMVI_SANDBOX_NAMESPACE` | `sandboxModule` | string | required for `kubernetes` |
| `CHAMVI_SANDBOX_IMAGE` | `sandboxModule` | image ref | `ghcr.io/chamvi/sandbox-node:24` |

The built-in modules read the lifecycle's `env` (`start({ env })`). The optional module factories read `options.env ?? process.env` **when they are called**, that is when the entry is imported, never `start({ env })`; a test configures them through their `env` option:

```ts
githubModule({ env: { GITHUB_APP_ID: '1', GITHUB_APP_PRIVATE_KEY: pem, GITHUB_WEBHOOK_SECRET: 'secret' } });
```

## Modules

Modules are orkos `IModule`s on an eldin container. The built-in ones are always there; listing a module with a built-in's name (`ModuleName`) in `modules` replaces it. Two modules sharing any other name throw `InvalidAgentDefinitionError`.

| Module | Name | Entry | Does |
|---|---|---|---|
| `configModule()` | `chamvi:config` | `@chamvi/app` | reads the config, registers `CONFIG`, `CLOCK`, `LOGGER` |
| `storeModule({ url?, store?, dataSource? })` | `chamvi:store` | `@chamvi/app` | `TypeormStore` over `DATABASE_URL` (migrated), else `MemoryStore`; the purge timer |
| `staticTokensModule({ tokens? })` | `chamvi:static-tokens` | `@chamvi/app` | the static-token authenticator from `CHAMVI_TOKENS` |
| `engineModule({ owner?, claimTtlMs? })` | `chamvi:engine` | `@chamvi/app` | checks the model strings, builds and starts the `Engine` |
| `schedulerModule({ agents?, owner?, lockTtlMs? })` | `chamvi:scheduler` | `@chamvi/app` | in-process cron (start mode, `CHAMVI_SCHEDULER`) |
| `httpModule()` | `chamvi:http` | `@chamvi/app` | `createHttpApp()`, the graceful shutdown, listens last |
| `consoleNotifierModule({ name? })` | `chamvi:notifier:<name>` | `@chamvi/app` | `consoleNotifier()` (name `console`) |
| `githubModule()` | `chamvi:github` | `@chamvi/app/github` | the GitHub App and its signed webhook route (`/webhooks/github`); `.app` for tools and triggers |
| `githubNotifierModule({ app, ... })` | `chamvi:notifier:<name>` | `@chamvi/app/github` | `githubNotifier()` |
| `sandboxModule({ provider?, ... })` | `chamvi:sandbox` | `@chamvi/app/sandbox` | the run-scoped workspace manager (`.manager`), closed after the engine drained |
| `openclawModule()` | `chamvi:notifier:<name>` | `@chamvi/app/openclaw` | `openclaw()` (name `openclaw`) |
| `uiModule()` | `chamvi:ui` | `@chamvi/app/ui` | the dashboard at `<basePath>/ui` |
| `authupModule()` | `chamvi:authup` | `@chamvi/app/authup` | the authup authenticator, after static tokens |
| `oidcModule(options)` | `chamvi:oidc` | `@chamvi/app/authup` | the `oidc()` authenticator, after authup (no env form) |

## Lifecycle

`start` sets the modules up in this order and listens last, so `/readyz` turns green only once everything runs:

1. config
2. store (and the migrations)
3. `engine.start()`
4. `scheduler.start()`
5. the purge timer
6. `serve()` on `HOST`:`PORT`

`stop()` (also during a start still setting up, which then never listens):

1. `/readyz` answers 503, then `CHAMVI_READINESS_DELAY_MS`
2. `scheduler.stop()` and the purge timer stop
3. the app's closers (SSE streams, MCP waits)
4. `server.close()`
5. `engine.drain()` for up to `CHAMVI_DRAIN_TIMEOUT_MS`
6. up to `CHAMVI_CLOSE_TIMEOUT_MS` for the close, then `server.close(true)`
7. the workspace manager closes (with `sandboxModule`)
8. the store's data source is destroyed

`stop()` rejects with `app_stop_failed` when anything failed meanwhile; the CLI then exits 1.

## Writing a module

A module contributes in `setup` and consumes in `onReady`, after every module's `setup` ran:

```ts
import type { IContainer } from 'eldin';
import type { IModule } from 'orkos';
import { AppToken, ModuleName } from '@chamvi/app';

export function auditModule(): IModule {
    return {
        name: 'audit',
        // onReady resolves ENGINE below, so the engine module comes first
        dependencies: [ModuleName.ENGINE],
        async setup(container: IContainer) {
            container.registerMany(AppToken.HTTP_ROUTES, {
                useValue: {
                    method: 'GET',
                    path: '/audit',
                    handler: async () => ({ status: 200, body: { ok: true } }),
                },
            });
        },
        async onReady(container: IContainer) {
            const logger = container.resolve(AppToken.LOGGER);
            container.resolve(AppToken.ENGINE).on('run.updated', ({ run }) => {
                logger.info('run updated', { run: run.id, status: run.status });
            });
        },
    };
}
```

- **Tokens** (`AppToken`): `CONTEXT`, `CONFIG`, `LOGGER`, `CLOCK`, `STORE`, `DATA_SOURCE`, `ENGINE`, `SCHEDULER`, `SHUTDOWN` and `SERVER` hold one value; `HTTP_ROUTES`, `AUTHENTICATORS` (`{ name, order, authenticator }`, lowest `order` first, `AUTHENTICATOR_ORDER`), `NOTIFIERS` and `LIFECYCLE_HOOKS` are collections (`registerMany(token, { useValue })` in `setup`, `resolveAll` in `onReady`).
- **Order**: contributions need none, since every consumer builds in `onReady`. A module that resolves `ENGINE`, `SCHEDULER` or `SERVER` in `onReady` lists that module in `dependencies`.
- **Hooks** (`LIFECYCLE_HOOKS`, `ILifecycleHook`): `engineCreated(engine)` before `engine.start()`, `started()` before the server listens, `stopping()` after the scheduler stopped, `drained()` after the engine drained, before the store closes.
- **Failures**: orkos never tears down a module whose `setup` threw, so a `setup` that throws closes what it opened first. A module whose `onReady` threw is torn down, so `teardown` tolerates state `onReady` never built.
- **Stopping**: `CONTEXT.signal` aborts once `stop()` is called; `throwIfStopped(context)` before a long step keeps a stopped start from going on. `context.report(error)` logs, and during `stop()` makes it reject.

## Models

A model string `'<provider>:<model>'` resolves through an AI SDK provider registry of every installed built-in provider (`BUILTIN_PROVIDERS`), overridden by `createApp({ models })`. Every string model is checked at `start` and `runJob`, so a string never falls through to the Vercel Gateway: a provider package that is not installed or an API key that is not set throws `InvalidAgentDefinitionError` naming the package or the variable (the CLI exits 2). Agents with a `LanguageModel` object are not checked.

The registry is installed as `globalThis.AI_SDK_DEFAULT_PROVIDER`, which is process-wide: two apps in one process share the first one's registry until it stops. A default provider set before `start` is left alone, and chamvi then checks no model strings.

## License

Published under [Apache License 2.0](./LICENSE).
