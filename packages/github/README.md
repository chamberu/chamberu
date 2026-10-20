<p align="center">
    <img src="https://raw.githubusercontent.com/chamberu/chamberu/master/.github/assets/logo.svg" alt="@chamberu/github" width="128" height="128" />
</p>

<h1 align="center">@chamberu/github</h1>

<p align="center">
    <b>GitHub App webhooks and tools for chamberu agents.</b><br>
    A verified delivery becomes one deduplicated run per matching agent,<br>
    and GitHub write tools never post twice after a retry, a recovery or a crash.
</p>

<p align="center">
    <a href="https://www.npmjs.com/package/@chamberu/github"><img src="https://img.shields.io/npm/v/@chamberu/github" alt="npm version" /></a>
    <a href="https://github.com/chamberu/chamberu/actions/workflows/ci.yml"><img src="https://github.com/chamberu/chamberu/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="https://github.com/chamberu/chamberu/blob/master/packages/github/LICENSE"><img src="https://img.shields.io/npm/l/@chamberu/github" alt="License" /></a>
</p>

---

**Table of Contents**
- [Installation](#installation)
- [GitHub App setup](#github-app-setup)
- [Usage](#usage)
- [Webhook route](#webhook-route)
- [Triggers](#triggers)
- [Tools](#tools)
- [Security](#security)
- [Options](#options)
- [API](#api)
- [License](#license)

## Installation

```bash
npm install @chamberu/github @chamberu/http @chamberu/core ai --save
```

ESM only, Node.js `>=22`. `@chamberu/core`, `@chamberu/http` and `ai` are peer dependencies. GitHub is reached through [`@octokit/core`](https://www.npmjs.com/package/@octokit/core) with the pagination plugin; the App JWT, the installation tokens and the webhook signatures use `node:crypto`.

## GitHub App setup

One GitHub App per agent repository (or organisation):

1. Create a GitHub App. Set the **webhook URL** to `https://<host><basePath>/webhooks/github`, the **content type to `application/json`** (a hook created by hand defaults to `application/x-www-form-urlencoded`, which the route answers with `415`) and a **webhook secret**.
2. Grant the permissions your tools need: *Issues* read and write for labels, comments and closing; *Pull requests* read; *Contents* read for `github_get_file` and `github_get_latest_release`. Subscribe to the events your triggers name (e.g. *Issues*).
3. Generate a private key and install the App on the repositories the agents may act on.
4. Pass the App id, the private key (PKCS#1 or PKCS#8 PEM; a one-line env var with literal `\n` works) and the webhook secret to `createGithubApp()`. Set `slug` in production, so the bot login needs no `GET /app`.

## Usage

`createGithubApp()` holds the App credentials; `gh.webhookRoute()` plugs into `createHttpApp({ routes })`, and `gh.readTools()` / `gh.writeTools()` are plain AI SDK `ToolSet`s:

```typescript
import type { LanguageModel } from 'ai';
import { MemoryStore, RunEngine, defineAgent } from '@chamberu/core';
import { createGithubApp, githubWebhook } from '@chamberu/github';
import type { GithubAppOptions } from '@chamberu/github';
import { createHttpApp, createShutdown, staticTokens } from '@chamberu/http';

export async function createTriageServer(
    model: LanguageModel,
    options: Pick<GithubAppOptions, 'fetch' | 'clock'> = {},
) {
    const {
        GITHUB_APP_ID,
        GITHUB_PRIVATE_KEY,
        GITHUB_WEBHOOK_SECRET,
        CHAMBERU_TOKEN,
        RESUME_SECRET,
    } = process.env;
    if (!GITHUB_APP_ID || !GITHUB_PRIVATE_KEY || !GITHUB_WEBHOOK_SECRET || !CHAMBERU_TOKEN || !RESUME_SECRET) {
        throw new Error('Set GITHUB_APP_ID, GITHUB_PRIVATE_KEY, GITHUB_WEBHOOK_SECRET, CHAMBERU_TOKEN and RESUME_SECRET.');
    }

    const gh = createGithubApp({
        appId: GITHUB_APP_ID,
        privateKey: GITHUB_PRIVATE_KEY,
        webhookSecret: GITHUB_WEBHOOK_SECRET,
        ...options,
    });

    const triage = defineAgent({
        name: 'triage',
        model,
        instructions: 'Label new issues and thank the author in one comment.',
        // one run per issues.opened delivery, deduplicated by the delivery id
        triggers: [githubWebhook({ events: ['issues.opened'] })],
        tools: () => ({ ...gh.readTools(), ...gh.writeTools() }),
        approvals: { github_close_issue: 'user' },
    });

    const engine = new RunEngine({
        store: new MemoryStore(),
        agents: [triage],
        resumeSecret: RESUME_SECRET,
    });

    const shutdown = createShutdown({ engine });
    const app = createHttpApp({
        // the webhook route dispatches to the engine's agents
        engine,
        auth: staticTokens({ tokens: { [CHAMBERU_TOKEN]: { id: 'ci', permissions: ['*'] } } }),
        // POST /webhooks/github: point the App's webhook URL here
        routes: [gh.webhookRoute()],
        shutdown,
    });

    await engine.start();
    return {
        app,
        engine,
        shutdown,
    };
}
```

## Webhook route

`POST /webhooks/github` (or `webhookRoute({ path })`, under the http app's `basePath`) checks, in this order:

| Check | Answer |
|---|---|
| `X-Hub-Signature-256` missing | `401` |
| `X-GitHub-Event` not `^[a-z0-9_]+$`, `X-GitHub-Delivery` not 1 to 255 characters | `400` |
| Body above the app's `bodyLimit` | `413` |
| Non-JSON content type (e.g. `application/x-www-form-urlencoded`) | `415` |
| `sha256=` HMAC of the raw body bytes under none of the webhook secrets | `401` |
| Body not a JSON object | `400` |

A verified delivery is dispatched to every agent with a matching `githubWebhook()` trigger, **at most one run per agent** (its first matching trigger), with `source: 'github'` and the `GithubEvent` as payload. The answer is `202 { delivery, runs: [{ agent, runId, deduplicated }] }`, also for `ping`, for events no trigger matches and for events the App sent itself (`runs: []`).

- **Dedupe**: the idempotency key is the delivery id (or the trigger's `idempotencyKey(event)`), so a redelivery returns the existing runs with `deduplicated: true`. The signature covers the body only, neither the `X-GitHub-Delivery` nor the `X-GitHub-Event` header (`e.delivery`, `e.name`): whoever holds one signed delivery (a proxy log, a support dump) can replay it under new delivery ids, or under another event name an agent listens on, and start a new run each time. On an exposed endpoint, derive the key from body fields only, e.g. `` idempotencyKey: (e) => `${e.action}:${e.payload.repository?.full_name}#${e.payload.issue?.number}@${e.payload.issue?.updated_at}` ``, and let a `filter` check that the body carries what the event name implies (`issue` without `comment` for `issues`, `comment` for `issue_comment`, `pull_request` for `pull_request`).
- **Failures**: agents are matched and dispatched in order and a failing one (a throwing `filter` or key function, a key `dispatch` refuses, a failed dispatch) does not stop the others; each failure goes to the http app's `onError`, and the answer is then `500`. **GitHub does not redeliver failed deliveries automatically**: redeliver a `4xx`/`5xx` delivery by hand (the App's *Advanced* tab) or through the redelivery API. A redelivery keeps the delivery id, so the agents that already got their run are deduplicated.
- **Self guard**: a delivery whose `sender` is the App's own bot (`<slug>[bot]`, `type: 'Bot'`) starts no run, so an agent is not woken by its own comment. Other bots (`dependabot[bot]`, a second chamberu App on the same repository) are ordinary senders; use a trigger `filter` to break loops between two Apps.
- **Body size**: the route inherits the app's `bodyLimit` (1 MiB by default). Issue and comment deliveries are far below it; raise `bodyLimit` on `createHttpApp` for large `push` or `pull_request` deliveries (GitHub sends up to 25 MB), which are otherwise answered `413`.
- The route is not rate limited and not authenticated by the app's authenticators: the signature is its credential.

## Triggers

```ts
githubWebhook({
    events: ['issues.opened', 'issue_comment.created'],  // 'issues' matches every action
    filter: (event) => event.payload.repository?.full_name === 'octo/demo',
});
```

| Option | Default | Description |
|---|---|---|
| `events` | required | `'<event>'` or `'<event>.<action>'`, at least one |
| `id` | `github:<events joined by ','>` | Trigger id; two triggers with the same events need distinct ids |
| `filter` | none | `(event) => boolean`, after the event match; also the way to break loops between two Apps, which see each other as ordinary bots |
| `idempotencyKey` | the delivery id | `(event) => string \| undefined` |
| `concurrencyKey` | `<owner>/<repo>#<issue or pull request number>`, else `<owner>/<repo>` | `(event) => string \| undefined`; runs on one issue wait for each other |

The run payload is a `GithubEvent { name, action?, delivery, installationId?, payload }`, where `payload` is the full GitHub body. A derived key above 255 characters or with a NUL fails that agent like a throwing `filter` (see *Failures*).

## Tools

Every tool acts as an installation: the delivery's for a run started by a GitHub delivery, else `installationId` from `createGithubApp()` (cron, REST and MCP runs). Without either, a tool fails the run (`FatalToolError`). Inputs name the repository as `owner/name` (GitHub's name characters; `.` and `..` are refused). Every installation request carries the run's signal, so cancel, drain and the run timeout abort a stalled GitHub call. The App-authenticated requests (the token exchange and `GET /app` for the bot login) are shared by every waiting run and delivery, so they carry no run's signal; each is aborted after 30 s on the app's clock instead, and the next caller retries. A failed GitHub call reaches the model as `GitHub <status>: <message>`, never with the request or its token.

| Tool | Kind | Input | Result |
|---|---|---|---|
| `github_get_issue` | read | `repo`, `number` | `number`, `title`, `body`, `state`, `labels`, `author`, `url`, `createdAt`, `comments`, `isPullRequest` |
| `github_search_issues` | read | `query`, `limit?` (1 to 20, default 10) | `total`, `items: [{ repo, number, title, state, url }]` |
| `github_list_labels` | read | `repo` | `[{ name, description }]`, every page |
| `github_get_pull_request` | read | `repo`, `number` | `number`, `title`, `body`, `state`, `draft`, `merged`, `base`, `head`, `author`, `url`, `changedFiles` |
| `github_get_file` | read | `repo`, `path`, `ref?` | `{ path, size, content, truncated }` (cut at 65 536 characters) or `{ path, entries }` for a directory |
| `github_get_latest_release` | read | `repo` | `{ tag, name, publishedAt, url, body }` or `{ none: true }` |
| `github_add_labels` | effect | `repo`, `number`, `labels` (1 to 20) | `{ labels }`: once per run and input (labels are a set) |
| `github_create_comment` | effect | `repo`, `number`, `body` | `{ id, url }`: **one comment per issue per model step** |
| `github_close_issue` | effect | `repo`, `number`, `reason?` (`completed`, `not_planned`) | `{ number, state, stateReason }`; an issue already closed is not patched again |

The write tools are effect tools (`defineEffectTool` from core). `github_create_comment` keys its effect by run, issue and model step (`<runId>:github_create_comment:<owner>/<repo>#<n>:<step>`, owner and repo lower-cased since GitHub resolves them case-insensitively) and embeds the key as a hidden marker (`<!-- chamberu:effect=... -->`). When the effect record is lost (a crash between GitHub accepting the comment and the checkpoint), the redone step finds the App's own comment with that marker (comments updated since the run was received, less an hour) and returns it instead of posting again, although the model wrote a different text. A second call for the same issue in the same step returns the first comment, so the tool description asks the model to put everything for one issue into one comment.

Approvals live on the agent: `approvals: { github_close_issue: 'user' }` pauses the run before an issue is closed.

## Security

- Installation tokens are cached per installation and replaced five minutes before they expire, so a run resumed hours later after an approval gets a fresh one. Tokens, the private key and JWTs are never logged and never stored in a run, step or effect.
- The tools reach every repository the installation can reach. An issue body is untrusted input: a model steered by it can act on any of those repositories, so install the App only where the agent may act, and gate destructive tools with approvals.
- `requireToolPermission()` from `@chamberu/core` denies every tool to runs without an invoker, and delivery runs have none. GitHub agents use `requireToolPermission({ withoutInvoker: 'allow' })` or wrap it.
- Webhook secrets can be rotated: pass `webhookSecret: [old, new]` while GitHub switches over.

## Options

`createGithubApp(options)`:

| Option | Type | Default | Description |
|---|---|---|---|
| `appId` | `string \| number` | required | The App id |
| `privateKey` | `string` | required | PEM (PKCS#1 or PKCS#8); literal `\n` sequences become newlines |
| `webhookSecret` | `string \| string[]` | required | A delivery verifies under any of them |
| `installationId` | `number` | none | For runs not started by a delivery |
| `slug` | `string` | `GET /app` once | The App's slug as in `github.com/apps/<slug>` (lower case), for the bot login `<slug>[bot]` |
| `baseUrl` | `string` | `https://api.github.com` | GitHub Enterprise Server: `https://<host>/api/v3` (absolute https URL; empty means the default) |
| `clock` | `IClock` | `systemClock` | Token expiry and JWT times |
| `fetch` | `typeof fetch` | global `fetch` | Every GitHub request |

`createGithubApp` throws `InvalidAgentDefinitionError` for an empty `appId`, a key that is no RSA private key, an empty secret, an `installationId` that is no positive integer, a `baseUrl` that is no absolute https URL (or has a query or hash) and a `slug` that is not the App's lower-case slug (`^[a-z0-9]+(-[a-z0-9]+)*$`, as in `github.com/apps/<slug>`; a miscased one would silently disable the self guard).

## API

| Export | Kind | Purpose |
|---|---|---|
| `createGithubApp` | function | The App: `octokit(installationId)`, `botLogin()`, `verifySignature()`, `webhookRoute()`, `readTools()`, `writeTools()` |
| `githubWebhook` | function | The trigger factory |
| `DEFAULT_WEBHOOK_PATH`, `DEFAULT_GITHUB_API_URL` | constant | `/webhooks/github`, `https://api.github.com` |

Types: `GithubAppOptions`, `IGithubApp`, `GithubOctokit`, `GithubEvent`, `GithubPayload`, `GithubWebhookTriggerOptions`, `GithubWebhookRouteOptions`, `GithubWebhookResult`, `GithubIssue`, `GithubIssueSearch`, `GithubLabel`, `GithubPullRequest`, `GithubFile`, `GithubDirectory`, `GithubRelease`, `GithubComment`, `GithubIssueLabels`, `GithubClosedIssue`.

## License

Published under [Apache License 2.0](./LICENSE).
