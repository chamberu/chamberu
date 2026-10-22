# @chamvi/github

GitHub App webhooks and tools for chamvi agents. The public API of `packages/github/src/index.ts`.

```bash
npm install @chamvi/github @chamvi/http @chamvi/core ai --save
```

`@chamvi/core`, `@chamvi/http` and `ai` are peer dependencies. See [GitHub App](/deployment/github-app) for setup and behaviour.

## createGithubApp

```ts
function createGithubApp(options: GithubAppOptions): IGithubApp;

const DEFAULT_GITHUB_API_URL: 'https://api.github.com';
const DEFAULT_WEBHOOK_PATH: '/webhooks/github';
```

Throws `InvalidAgentDefinitionError` for an empty `appId`, a key that is no RSA private key, an empty webhook secret, an `installationId` that is no positive integer, a `baseUrl` that is no absolute https URL without query (empty means `https://api.github.com`) and a `slug` that is not the App's lower-case slug (`^[a-z0-9]+(-[a-z0-9]+)*$`, as in the App's URL; a miscased one would silently disable the self guard).

<<< ../../../github/src/app/types.ts{ts}

```ts
const GITHUB_REQUEST_ERROR_CODE: 'github_request';
const REPO_PATTERN: string; // '^([\\w.-]*[\\w-][\\w.-]*)/([\\w.-]*[\\w-][\\w.-]*)$'
```

`GITHUB_REQUEST_ERROR_CODE` is the `code` of every failed GitHub request (the tools' errors and `@chamvi/notify-github`'s); `REPO_PATTERN` is the `owner/name` rule the tools apply (GitHub's name characters, each segment with one that is not a dot, so `.` and `..` never fold the URL into another API path). Build a `RegExp` from it.

## githubWebhook

```ts
function githubWebhook(options: GithubWebhookTriggerOptions): TriggerDefinition<GithubEvent>;
```

Throws `InvalidAgentDefinitionError` without events or for an event that is not `name` or `name.action` (lower case letters, digits and underscores, e.g. `projects_v2_item.created`).

<<< ../../../github/src/trigger/types.ts{ts}

## Webhook route

`gh.webhookRoute(options?)` returns an `HttpRoute` for `createHttpApp({ routes })`; it answers `202` with a `GithubWebhookResult`.

<<< ../../../github/src/webhook/types.ts{ts}

## Tools

`gh.readTools()` and `gh.writeTools()` return plain AI SDK `ToolSet`s; the results are these shapes.

<<< ../../../github/src/tools/types.ts{ts}

## Context

```ts
function provideGithubContext(provider: IContextProvider, app: IGithubApp): void; // engine.provide under the key 'github'
function injectGithubContext(ctx: ToolContext): IGithubApp;                    // else ContextNotProvidedError
```

`githubModule()` provides its app; with a hand-built engine call `provideGithubContext(engine, gh)` after `new Engine()`. Inject in a tools factory (`tools: (ctx) => injectGithubContext(ctx).readTools()`), in a tool's `execute` or in an effect hook; see [Context](/guide/tools#context-shared-instances-for-tools). One app per engine: a second provide throws `InvalidAgentDefinitionError`.

## Module

```ts
// @chamvi/github/module, needs @chamvi/app
function githubModule(options?: GithubModuleOptions): GithubModule; // name GITHUB_MODULE_NAME 'chamvi:github', .app: IGithubApp
```

Reads `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET` (comma-separated), `GITHUB_INSTALLATION_ID`, `GITHUB_APP_SLUG` and `GITHUB_API_URL` from `options.env ?? process.env` when it is called, unless `options.app` is given; explicit options win. `setup` contributes the signed webhook route (`webhookPath`, default `/webhooks/github`) to the app's routes, and the `engineCreated` hook provides `.app`. `@chamvi/app` is an optional peer: the main entry never imports it. See [Apps & Modules](/guide/app#modules).

<<< ../../../github/src/module/types.ts{ts}
