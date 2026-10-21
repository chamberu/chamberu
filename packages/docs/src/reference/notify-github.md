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

Throws `InvalidAgentDefinitionError` for a missing `app`, an empty `name`, a `mention` that is no GitHub login (without `@`), a `target.repo` that is not `owner/name` (`REPO_PATTERN` of `@chamvi/github`), a `target.number` or `timeoutMs` that is no positive integer and a `resumeUrl` that is no function.

<<< @/snippets/notify-github.ts#notifier

### Target and installation

| Run | Comments on | As installation |
|---|---|---|
| `source: 'github'` with `repository.full_name` and `issue.number` or `pull_request.number` | that issue or pull request | the event's `installationId`, else the app's |
| any other `github` run (e.g. `push`) | `target` | the event's `installationId`, else the app's |
| cron, http, mcp, webhook | `target` | the app's `installationId` |

Without an issue and without `target`, or without an installation, `notify()` throws `InvalidAgentDefinitionError` before any request, on every poll: set `target` for agents not started by issue or pull request events.

### The comment

```
@<mention> @<mention>

### <title>

<fence>
<body, cut to COMMENT_BODY_MAX_LENGTH characters>
<fence>

Waiting for approval until <expiresAt ISO>. Approve or deny: <resumeUrl(token)>
Run `<runId>` of agent `<agent>`.

<!-- chamvi:effect=<idempotencyKey> -->
```

The fence is one backtick longer than the longest backtick run in the body (at least three; runs over 31 backticks are broken with zero-width spaces), so mentions and issue references inside notify nobody and no input closes it. Without `resumeUrl` the approval line ends `Answer it in the chamvi UI, the REST API or the MCP tool resume_run.`; the bare resume token never appears. A key that is not `^[\w:.-]{1,255}$` or contains `--` goes into the marker as `sha256:<hex>`.

### Dedupe and failures

Before posting, the notifier pages the issue's comments (`since` = the run's `receivedAt` minus one hour, 100 per page) and resolves without posting when one by the App bot (`IGithubApp.botLogin()`, compared case-insensitively) holds the marker; a copy by anyone else does not count. Every failure throws a `ChamviError` with `code` `github_request` (`GitHub <status>: <message>`, `GitHub request failed: <message>`); a list or post that takes longer than `timeoutMs` throws `GitHub did not answer within <ms>ms.` The token exchange and `GET /app` are not bound by `timeoutMs`; `@chamvi/github` aborts each after 30 s itself.
