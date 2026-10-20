# @chamberu/github

GitHub App webhooks and tools for chamberu agents. The public API of `packages/github/src/index.ts`.

```bash
npm install @chamberu/github @chamberu/http @chamberu/core ai --save
```

`@chamberu/core`, `@chamberu/http` and `ai` are peer dependencies. See [GitHub App](/deployment/github-app) for setup and behaviour.

## createGithubApp

```ts
function createGithubApp(options: GithubAppOptions): IGithubApp;

const DEFAULT_GITHUB_API_URL: 'https://api.github.com';
const DEFAULT_WEBHOOK_PATH: '/webhooks/github';
```

Throws `InvalidAgentDefinitionError` for an empty `appId`, a key that is no RSA private key, an empty webhook secret and an `installationId` that is no positive integer.

<<< ../../../github/src/app/types.ts{ts}

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
