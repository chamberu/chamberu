<p align="center">
    <img src="https://raw.githubusercontent.com/chamvi/chamvi/master/.github/assets/logo.svg" alt="@chamvi/notify-github" width="128" height="128" />
</p>

<h1 align="center">@chamvi/notify-github</h1>

<p align="center">
    <b>GitHub issue comment notifier for chamvi agents.</b><br>
    Approval requests land as one comment on the run's issue or pull request,<br>
    found again by a hidden marker, so a retried send never posts twice.
</p>

<p align="center">
    <a href="https://www.npmjs.com/package/@chamvi/notify-github"><img src="https://img.shields.io/npm/v/@chamvi/notify-github" alt="npm version" /></a>
    <a href="https://github.com/chamvi/chamvi/actions/workflows/ci.yml"><img src="https://github.com/chamvi/chamvi/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="https://github.com/chamvi/chamvi/blob/master/packages/notify-github/LICENSE"><img src="https://img.shields.io/npm/l/@chamvi/notify-github" alt="License" /></a>
</p>

---

**Table of Contents**
- [Installation](#installation)
- [App permissions](#app-permissions)
- [Usage](#usage)
- [Targets](#targets)
- [Security](#security)
- [Options](#options)
- [API](#api)
- [License](#license)

## Installation

```bash
npm install @chamvi/notify-github @chamvi/github @chamvi/core --save
```

ESM only, Node.js `>=22`. `@chamvi/core` and `@chamvi/github` are peer dependencies; the notifier comments through the installation Octokit of [`@chamvi/github`](../github)'s `createGithubApp()`.

## App permissions

The GitHub App needs *Issues* read and write (pull request comments are issue comments), and it must be installed on the repositories it comments on.

## Usage

`githubNotifier({ app })` is an `INotifier`; register it on the engine and name it in the agent's `notify`:

```typescript
import type { LanguageModel } from 'ai';
import { Engine, MemoryStore, defineAgent } from '@chamvi/core';
import { createGithubApp, githubWebhook } from '@chamvi/github';
import type { GithubAppOptions } from '@chamvi/github';
import { githubNotifier } from '@chamvi/notify-github';

export function createIssueApprovalEngine(
    model: LanguageModel,
    options: Pick<GithubAppOptions, 'fetch' | 'clock'> = {},
) {
    const {
        GITHUB_APP_ID,
        GITHUB_PRIVATE_KEY,
        GITHUB_WEBHOOK_SECRET,
        GITHUB_OWNER,
        RESUME_SECRET,
        APP_URL,
    } = process.env;
    if (!GITHUB_APP_ID || !GITHUB_PRIVATE_KEY || !GITHUB_WEBHOOK_SECRET || !GITHUB_OWNER || !RESUME_SECRET || !APP_URL) {
        throw new Error('Set GITHUB_APP_ID, GITHUB_PRIVATE_KEY, GITHUB_WEBHOOK_SECRET, GITHUB_OWNER, RESUME_SECRET and APP_URL.');
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
        instructions: 'Close issues that are duplicates.',
        triggers: [githubWebhook({ events: ['issues.opened'] })],
        tools: () => gh.writeTools(),
        // closing waits for the owner, who is asked on the issue itself
        approvals: { github_close_issue: 'user' },
        notify: 'github',
    });

    const engine = new Engine({
        store: new MemoryStore({ clock: options.clock }),
        agents: [triage],
        notifiers: {
            github: githubNotifier({
                app: gh,
                mention: GITHUB_OWNER,
                // a link to the approval in the chamvi UI, without the token
                approvalUrl: ({ runId, approvalId }) => `${APP_URL}/ui/approvals?run=${encodeURIComponent(runId)}&approval=${encodeURIComponent(approvalId)}`,
                clock: options.clock,
            }),
        },
        resumeSecret: RESUME_SECRET,
        clock: options.clock,
    });
    return { engine, gh };
}
```

Per notification the notifier:

1. resolves the issue or pull request (see [Targets](#targets)); a run without one throws `InvalidAgentDefinitionError` before any request,
2. lists the issue's comments updated since the run's `receivedAt` minus one hour and returns when one by the App bot (`<slug>[bot]`, compared case-insensitively) holds the marker `effectMarker(idempotencyKey)`,
3. else posts the comment:

````md
@octocat

### Approval required: github_close_issue

```
Agent "triage" wants to call "github_close_issue" with:
{ "repo": "octo/demo", "number": 7 }
```

Waiting for approval until 2026-10-22T09:00:00.000Z. Approve or deny: https://chamvi.example/ui/approvals?run=<runId>&approval=<approvalId>
Run `<runId>` of agent `triage`.

<!-- chamvi:effect=<runId>:<approvalId> -->
````

The engine's key (`<runId>:<approvalId>`) goes into the marker as is; a key with characters an HTML comment cannot hold (`--`, whitespace) or over 255 characters is replaced by `sha256:<hex>`. A lost response is therefore harmless: the next poll finds the comment and records the approval as notified.

Every failure throws a `ChamviError` with code `github_request` (`GitHub <status>: <message>`), as does a GitHub that does not answer within `timeoutMs` (30 s, for the comment list and the post; the token exchange and `GET /app` are bounded by `@chamvi/github` itself). The engine reports it to `onError` and sends again on the next poll.

## Targets

- A run started by a `githubWebhook()` trigger comments on the event's issue (`payload.issue.number`) or pull request (`payload.pull_request.number`) of `payload.repository.full_name`, as the event's installation.
- Every other run (cron, http, mcp, or a GitHub event without issue or pull request, such as `push`) comments on `target: { repo, number, installationId? }`, as `target.installationId` when set, else the event's installation for a GitHub run, else the app's `installationId`. Set `target.installationId` when the target repository belongs to another installation than the runs (an App installed on several organizations); a wrong installation answers 404 on every poll.
- **Set `target` for agents that are not started by issue or pull request events.** Without one every approval of such a run fails with `InvalidAgentDefinitionError` on every poll (reported to `onError`) until it times out.

## Security

- The comment is public to everyone who can read the issue. It never carries the resume token. With `approvalUrl` it carries a link to the approval in the chamvi UI (run and approval id only), where the owner signs in and answers through `POST /runs/:id/approve` (`agent:<agent>:approve` of the signed-in principal); without it, the hint to answer in the UI, the REST API or the MCP tool `resume_run`.
- The notification body (the tool input as the model wrote it) sits in a fence one backtick longer than any backtick run in it, so a `@login`, `@org/team` or `#123` inside notifies nobody and cross-links nothing, and no input closes the fence. Backtick runs over 31 are broken with U+200B zero-width spaces first, so the fence stays short and the comment within GitHub's limit; such a body is then not byte-identical to the tool input. The title's whitespace runs (line breaks included) are collapsed to one space, so it stays one heading line. Only the configured `mention` logins are notified.
- The body is cut to 60 000 characters (GitHub refuses comments over 65 536), never inside a surrogate pair.
- A comment by anyone but the App bot that copies the marker does not count as delivered.

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `app` | `IGithubApp` | required | From `createGithubApp()` |
| `name` | `string` | `'github'` | The notifier name an agent's `notify` references |
| `mention` | `string \| string[]` | none | Logins (without `@`) mentioned at the top of every comment |
| `target` | `{ repo, number, installationId? }` | none | The issue or pull request for runs without one (`repo` as `owner/name`), and the installation to comment as |
| `approvalUrl` | `({ runId, approvalId, agent }) => string` | none | A link to the approval in the chamvi UI, e.g. `https://<app>/ui/approvals?run=<runId>&approval=<approvalId>`; it carries no token |
| `timeoutMs` | `number` | `30_000` | Bound of the comment list and the post, on the `clock` |
| `clock` | `IClock` | `systemClock` | Time source of the timeout |

Every option is checked when `githubNotifier()` is called; a bad one throws `InvalidAgentDefinitionError`.

## API

| Export | Kind | Purpose |
|---|---|---|
| `githubNotifier` | function | `githubNotifier(options)`: an `INotifier` commenting on the run's issue or pull request |
| `GITHUB_NOTIFIER_TIMEOUT_MS` | constant | `30_000`, the default `timeoutMs` |
| `COMMENT_BODY_MAX_LENGTH` | constant | `60_000`, the cut of `Notification.body` in the comment |

Types: `GithubNotifierOptions`, `GithubNotifierTarget`.

## License

Made with 💚

Published under [Apache License 2.0](./LICENSE).
