# @chamvi/app

Boots chamvi agents as an app. The public API of `packages/app/src/index.ts` and its subpath entries; see [Apps & Modules](/guide/app) for the concepts.

```bash
npm install @chamvi/app ai typeorm pg
```

`ai`, `typeorm` and `pg` are peer dependencies. The provider packages (`@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`, `@ai-sdk/mistral`, `@ai-sdk/xai`) and the packages behind the optional modules are optional peers. The main entry re-exports `@chamvi/core` and `agentPermission`, `Permission` and the `Authenticator`, `Principal`, `HttpRoute`, `HttpRouteContext`, `HttpRouteRequest`, `HttpRouteResult` and `StaticToken` types of `@chamvi/http`.

| Entry | Exports | Needs |
|---|---|---|
| `@chamvi/app` | `createApp`, `isApp`, the built-in modules, tokens, env readers, `readConfig`, `createLogger`, `createModelRegistry` | |
| `@chamvi/app/authup` | `authupModule`, `oidcModule` | `@authup/server-adapter-kit`, `@authup/core-http-kit` |

## createApp

```ts
function createApp(options: AppOptions): IApp;
function isApp(value: unknown): value is IApp;

const APP_BRAND: unique symbol; // Symbol.for('chamvi.app')
```

Synchronous and side-effect free. Throws `InvalidAgentDefinitionError` for a module list entry that is no `IModule` and for two modules of one name (a built-in's name included: list one module to replace a built-in). `isApp` checks the brand, so an app of another installed copy matches.

<<< ../../../app/src/app/types.ts{ts}

| Method | Builds | Rejects with |
|---|---|---|
| `start` | config, store (migrated unless `CHAMVI_MIGRATE=false`), engine, scheduler (unless `CHAMVI_SCHEDULER=false`), http; starts the engine and scheduler once every module built, resolves once listening | the setup error (a module graph error as `InvalidAgentDefinitionError`); `app_stopped` when `stop()` interrupted the setup (the setup's own error is logged); `app_in_use` for a second lifecycle or after `stop()` |
| `stop` | the shutdown sequence (see [Start and stop](/guide/app#start-and-stop)); memoized, waits for a setup in flight | `app_stop_failed` when a teardown failed (each failure is logged) |
| `runJob` | config, store (migrated), engine (not started: `@chamvi/scheduler` `runJob` starts, ticks and drains it); no scheduler, no http | the job's error; `app_in_use` |
| `migrate` | config, store (`migrateStore`), store teardown | `InvalidAgentDefinitionError` without `DATABASE_URL`; `app_in_use` |

`runJob` resolves `exitCode: 0` for a `completed`, `waiting`, `skipped`, queued-behind-an-approval or signal-interrupted run, `1` for `failed` or `cancelled`.

## Errors

`ChamviError` codes in `APP_ERROR_CODE`:

| Code | When |
|---|---|
| `app_stopped` | The lifecycle's abort reason once `stop()` was called; a start stopped while setting up rejects with it |
| `app_in_use` | A second `start`, `runJob` or `migrate` on the same app |
| `app_stop_failed` | `stop()` (or a job's teardown) after one or more teardown errors, each logged |

Configuration errors (a malformed or missing variable, a model string without its provider, a duplicate module name) are core `InvalidAgentDefinitionError`s; they name the variable and never echo its value.

## Environment

Read by `readConfig(env, { mode, dev })` once per lifecycle; the optional module factories read their own variables when they are called. Empty string is unset, integers are `/^\d+$/` (every `*_MS` variable at most `TIMER_MAX_MS`, 2147483647, since a larger Node timer fires after 1 ms), booleans `true`, `false`, `1` or `0`.

| Variable | Module | Type | Default | Required when |
|---|---|---|---|---|
| `PORT` | http | int 1..65535 | `3000` | never |
| `HOST` | http | string | `0.0.0.0` | never |
| `CHAMVI_BASE_PATH` | http | empty or `^(?:\/[a-z0-9._~-]+)+$` | `''` (health at `/healthz`, UI at `/ui`) | never |
| `CHAMVI_PUBLIC_URL` | http, ui, notifiers | absolute URL | unset | an approval link is wanted |
| `CHAMVI_LOG_LEVEL` | config | `error`, `warn`, `info`, `debug` | `info` | never |
| `DATABASE_URL` | store | `postgres://...` | unset: `MemoryStore` (warned outside dev) | `migrate`; any multi-replica or CronJob deployment |
| `CHAMVI_MIGRATE` | store | bool | `true` | never |
| `CHAMVI_PURGE_INTERVAL_MS` | store | int, `0` disables | `3600000` (only with `TypeormStore`, on `engine.clock`) | never |
| `RESUME_SECRET` | engine | string, at least 32 characters | none (dev: random per process, warned) | `start`, `run-job` |
| `CHAMVI_MAX_CONCURRENT_RUNS` | engine | int >= 1 | `4` | never |
| `CHAMVI_SCHEDULER` | scheduler | bool | `true`; `false` runs no in-process cron (CronJob mode) | never |
| `CHAMVI_READINESS_DELAY_MS` | http shutdown | int | `0` | never |
| `CHAMVI_DRAIN_TIMEOUT_MS` | http shutdown | int | `30000` (dev 5000) | never |
| `CHAMVI_CLOSE_TIMEOUT_MS` | http shutdown | int | `5000` | never |
| `CHAMVI_FORCE_EXIT_MS` | cli | int | `90000` (dev 15000) | never |
| `CHAMVI_TOKENS` | static tokens | JSON `[{ "value", "id", "permissions": [] }]`, `value` at least 16 characters and unique | unset (dev: one random `*` token, warned) | no other authenticator is configured, outside dev |
| `AUTHUP_URL`, `AUTHUP_CLIENT_ID`, `AUTHUP_CLIENT_SECRET` | `authupModule` | URL, string, string | unset | `authupModule()` without options |
| `CHAMVI_UI_AUTHUP_CLIENT_ID`, `CHAMVI_UI_AUTHUP_REALM_ID` | `uiModule` | string | unset (token login only) | the dashboard signs in through authup (URL from `AUTHUP_URL`) |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `MISTRAL_API_KEY`, `XAI_API_KEY` | models | string | unset | a model string names that provider and `models` does not override it; `ANTHROPIC_BASE_URL`, `OPENAI_BASE_URL` are passed on |
| `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` (PEM, literal `\n` allowed), `GITHUB_WEBHOOK_SECRET` (comma-separated for rotation) | `githubModule` | string | none | `githubModule()` without options |
| `GITHUB_INSTALLATION_ID`, `GITHUB_APP_SLUG`, `GITHUB_API_URL` | `githubModule` | int, slug, https URL | unset | never |
| `OPENCLAW_BASE_URL`, `OPENCLAW_HOOKS_TOKEN`, `OPENCLAW_CHANNEL`, `OPENCLAW_TO` | `openclawModule` | URL, string, string, string | none | `openclawModule()` without options |
| `OPENCLAW_HOOKS_PATH`, `OPENCLAW_AGENT_ID`, `OPENCLAW_ACCOUNT_ID` | `openclawModule` | string | `/hooks`, unset, unset | never |
| `CHAMVI_SANDBOX_PROVIDER` | `sandboxModule` | `local`, `docker`, `kubernetes` | the `provider` option, else `local` | never |
| `CHAMVI_SANDBOX_NAMESPACE` | `sandboxModule` | string | none | provider `kubernetes` |
| `CHAMVI_SANDBOX_IMAGE` | `sandboxModule` | image ref | `ghcr.io/chamvi/sandbox-node:24` | never |

```ts
function readConfig(env: Env, options: ReadConfigOptions): AppConfig;
function approvalUrlOf(config: AppConfig): ((ref: ApprovalRef) => string) | undefined; // needs CHAMVI_PUBLIC_URL
```

The env readers modules build on, each throwing `InvalidAgentDefinitionError` that names the variable:

```ts
function envString(env: Env, name: string, options?: EnvStringOptions): string | undefined;
function envInteger(env: Env, name: string, options?: EnvIntegerOptions): number | undefined;
function envBoolean(env: Env, name: string, options?: EnvReadOptions<boolean>): boolean | undefined;
function envUrl(env: Env, name: string, options?: EnvUrlOptions): string | undefined;
function envList(env: Env, name: string, options?: EnvReadOptions<string[]>): string[] | undefined; // comma-separated
function envJson(env: Env, name: string, options?: EnvJsonOptions): unknown;
function envOneOf<T extends string>(env: Env, name: string, values: readonly T[], options?: EnvReadOptions<T>): T | undefined;
```

With `required: true` or a `default` the overloads return a defined value.

<<< ../../../app/src/env/types.ts{ts}

## Built-in modules

```ts
function configModule(options?: ConfigModuleOptions): IModule;            // 'chamvi:config'
function storeModule(options?: StoreModuleOptions): IModule;              // 'chamvi:store'
function staticTokensModule(options?: StaticTokensModuleOptions): IModule; // 'chamvi:static-tokens'
function engineModule(options?: EngineModuleOptions): IModule;            // 'chamvi:engine'
function schedulerModule(options?: SchedulerModuleOptions): IModule;      // 'chamvi:scheduler'
function httpModule(options?: HttpModuleOptions): IModule;                // 'chamvi:http'
function consoleNotifierModule(options?: ConsoleNotifierModuleOptions): IModule; // 'chamvi:notifier:<name>'
```

Listing one of them in `createApp({ modules })` replaces the default instance.

<<< ../../../app/src/modules/config/types.ts{ts}

`StoreModuleOptions` (`store` is used as is and never closed; `dataSource` must be initialized, is migrated like a built one and never destroyed; `url` wins over `DATABASE_URL`; a data source built from a URL waits at most 10 s for Postgres to accept the first connection):

<<< ../../../app/src/modules/store/types.ts{ts}

<<< ../../../app/src/modules/static-tokens/types.ts{ts}

<<< ../../../app/src/modules/engine/types.ts{ts}

<<< ../../../app/src/modules/scheduler/types.ts{ts}

<<< ../../../app/src/modules/http/types.ts{ts}

## Optional modules

```ts
// @chamvi/github/module
function githubModule(options?: GithubModuleOptions): GithubModule;        // .app: IGithubApp, 'chamvi:github'

// @chamvi/notify-github/module
function githubNotifierModule(options: GithubNotifierModuleOptions): IModule; // 'chamvi:notifier:<name>', default name 'github'

// @chamvi/sandbox/module
function sandboxModule(options?: SandboxModuleOptions): SandboxModule;     // .manager: IWorkspaceManager, 'chamvi:sandbox'

// @chamvi/notify-openclaw/module
function openclawModule(options?: OpenclawModuleOptions): IModule;         // 'chamvi:notifier:<name>', default name 'openclaw'

// @chamvi/ui/module
function uiModule(options?: UiModuleOptions): IModule;                     // 'chamvi:ui'

// @chamvi/app/authup
function authupModule(options?: AuthupModuleOptions): IModule;             // 'chamvi:authup'
function oidcModule(options: OidcOptions): IModule;                        // 'chamvi:oidc', no env form
```

Each factory reads `options.env ?? process.env` when it is called and throws `InvalidAgentDefinitionError` naming a missing or malformed variable. Options win over env, except `CHAMVI_SANDBOX_PROVIDER`, `CHAMVI_SANDBOX_NAMESPACE` and `CHAMVI_SANDBOX_IMAGE`, which win over the sandbox options. The notifier modules default `approvalUrl` to the dashboard link built from `CHAMVI_PUBLIC_URL` and use the app's clock.

<<< ../../../github/src/module/types.ts{ts}

<<< ../../../notify-github/src/module/types.ts{ts}

<<< ../../../sandbox/src/module/types.ts#public{ts}

<<< ../../../notify-openclaw/src/module/types.ts{ts}

<<< ../../../ui/src/module/types.ts{ts}

<<< ../../../app/src/authup/types.ts{ts}

## Tokens and hooks

`AppToken` holds the container keys, `ModuleName` the built-in names, `AUTHENTICATOR_ORDER` the chain order (static tokens `0`, authup `10`, oidc `20`, lowest first):

<<< ../../../app/src/module/constants.ts{ts}

`AppContext`, `ILifecycleHook`, `AuthenticatorEntry`, `Server` and `AppTokens` (each token's value type):

<<< ../../../app/src/module/types.ts{ts}

```ts
function runHooks(container: IContainer, phase: LifecyclePhase, ...args: unknown[]): Promise<void>; // every LIFECYCLE_HOOKS entry, in order
function throwIfStopped(context: AppContext): void; // throws the app_stopped error once stop() was called
```

## Models

```ts
function createModelRegistry(options: ModelRegistryOptions): Promise<ProviderRegistryProvider>;
function installDefaultProvider(registry: ProviderRegistryProvider): () => void;

const BUILTIN_PROVIDERS: readonly BuiltinProvider[]; // anthropic, openai, google, mistral, xai
```

`createModelRegistry` imports every installed built-in provider package with its key from env, adds `models`, and checks every string model of `agents`: `Agent "<a>": model "<m>" needs the <id> provider; install <pkg>.`, `... needs an API key; set <VAR>.` or `... names the unknown provider "<id>"; available: <ids>.` (each an `InvalidAgentDefinitionError`). `installDefaultProvider` sets `globalThis.AI_SDK_DEFAULT_PROVIDER` only when none is set and returns the undo; the engine module does both at `start` and `runJob`. The global is process-wide: two apps in one process share the first one's registry until it stops, and a default provider set before `start` is left alone (no model strings are checked then).

<<< ../../../app/src/models/types.ts{ts}

## Logger

```ts
function createLogger(options?: LoggerOptions): ILogger;
```

One JSON line per entry (`{ level, time, msg, ...fields, error? }`, the error as `{ name, code, message, stack }` only, never its `cause`) on stderr, or through `write`. The engine's, the scheduler's and the HTTP app's `onError` all go through it.

<<< ../../../app/src/logger/types.ts{ts}
