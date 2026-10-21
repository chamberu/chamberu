# @chamvi/notify-github

The GitHub issue comment notifier. The public API of `packages/notify-github/src/index.ts`.

```bash
npm install @chamvi/notify-github @chamvi/github @chamvi/core --save
```

`@chamvi/core` and `@chamvi/github` are peer dependencies. The App needs *Issues* read and write. See [GitHub App](/deployment/github-app) for the App setup.

## githubNotifier

```ts
function githubNotifier(options: GithubNotifierOptions): INotifier;

const GITHUB_NOTIFIER_TIMEOUT_MS: 30_000;
const COMMENT_BODY_MAX_LENGTH: 60_000;
```

<<< ../../../notify-github/src/notifier/types.ts#public{ts}

Throws `InvalidAgentDefinitionError` for a missing `app`, an empty `name`, a `mention` that is no GitHub login (without `@`), a `target.repo` that is not `owner/name` (`REPO_PATTERN` of `@chamvi/github`), a `target.number`, `target.installationId` or `timeoutMs` that is no positive integer and an `approvalUrl` that is no function.

<<< @/snippets/notify-github.ts#notifier

### Target and installation

| Run | Comments on | As installation |
|---|---|---|
| `source: 'github'` with `repository.full_name` and `issue.number` or `pull_request.number` | that issue or pull request | the event's `installationId`, else the app's |
| any other `github` run (e.g. `push`) | `target` | `target.installationId`, else the event's `installationId`, else the app's |
| cron, http, mcp, webhook | `target` | `target.installationId`, else the app's `installationId` |

Set `target.installationId` when `target` lies in a repository of another installation than the runs' (an App installed on several organizations).

Without an issue and without `target`, or without an installation, `notify()` throws `InvalidAgentDefinitionError` before any request, on every poll: set `target` for agents not started by issue or pull request events.

### The comment

```
@<mention> @<mention>

### <title, whitespace runs collapsed to one space>

<fence>
<body, cut to COMMENT_BODY_MAX_LENGTH characters>
<fence>

Waiting for approval until <expiresAt ISO>. Approve or deny: <approvalUrl({ runId, approvalId, agent })>
Run `<runId>` of agent `<agent>`.

<!-- chamvi:effect=<idempotencyKey> -->
```

The fence is one backtick longer than the longest backtick run in the body (at least three; runs over 31 backticks are broken with U+200B zero-width spaces, so such a body is not byte-identical to the tool input; without it a body of backticks would need a fence as long as itself and push the comment over GitHub's 65 536 limit), so mentions and issue references inside notify nobody and no input closes it. The title has every run of whitespace (line breaks included) collapsed to one space and is trimmed, so it stays one heading line. Without `approvalUrl` (or for a notification without an `approvalId`) the approval line ends `Answer it in the chamvi UI or through POST /runs/:id/approve.`. `approvalUrl` gets the run id, the approval id and the agent, never the token: the resume token never appears in a comment or a request, and the owner answers in the UI, signed in, through `POST /runs/:id/approve`. A key that is not `^[\w:.-]{1,255}$` or contains `--` goes into the marker as `sha256:<hex>`.

### Dedupe and failures

Before posting, the notifier pages the issue's comments (`since` = the run's `receivedAt` minus one hour, 100 per page) and resolves without posting when one by the App bot (`IGithubApp.botLogin()`, compared case-insensitively) holds the marker; a copy by anyone else does not count. Every failure throws a `ChamviError` with `code` `github_request` (`GitHub <status>: <message>`, `GitHub request failed: <message>`); a list or post that takes longer than `timeoutMs` throws `GitHub did not answer within <ms>ms.` The token exchange and `GET /app` are not bound by `timeoutMs`; `@chamvi/github` aborts each after 30 s itself.
