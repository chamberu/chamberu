# Notifiers

A notifier delivers messages from the engine to the owner: today approval requests, later "stuck" pings and results. It is a small interface you implement or install.

<<< ../../../core/src/notify/types.ts{ts}

| `Notification` field | Description |
|---|---|
| `kind` | `approval`, `stuck`, `result` or `info`. The core engine sends `approval` |
| `agent`, `runId` | Who is asking |
| `title`, `body` | Human-readable text. For approvals the body shows the tool name and its input as JSON |
| `approvalId` | The wait point's approval id (approvals only), e.g. for a link to the approval in the UI |
| `resumeToken` | The signed token for [`engine.resume()`](/guide/approvals) (approvals only) |
| `expiresAt` | When the approval times out (approvals only) |

| `NotifyOptions` field | Description |
|---|---|
| `idempotencyKey` | Stable per logical notification (`<runId>:<approvalId>` for approvals) |
| `trigger` | The run's trigger envelope as stored (source, payload, receivedAt), e.g. to find the run's issue. Read it, never write it |

## Registering notifiers

Register notifiers by name on the engine and reference one from an agent with `notify`:

<<< @/snippets/engine.ts#many

The engine rejects an agent whose `notify` names no registered notifier.

## Built-in

`consoleNotifier()` from `@chamvi/core` logs each notification and an approval's resume token, for development only: the token approves the tool call, so keep it off in a deployment whose logs others read (a container's log collector).

```ts
import { Engine, consoleNotifier } from '@chamvi/core';

const engine = new Engine({ store, agents, resumeSecret, notifiers: { owner: consoleNotifier() } });
```

It takes `name` (default `console`) and `write(line)` (default `console.log`) and never throws.

## Writing a notifier

<<< @/snippets/notifiers.ts#console

A notifier that talks to a remote service sends no resume token (like the shipped notifiers): it posts the approval id, and the owner answers in the UI, signed in:

<<< @/snippets/webhook-notifier.ts#webhook

Two rules:

1. **Throw on failure.** Never swallow a failed send. The engine records `waiting.notifiedAt` only after `notify()` resolves, and retries every poll until it does.
2. **Respect `idempotencyKey`.** It is stable per logical notification (`<runId>:<approvalId>` for approvals). If the engine crashed after a successful send but before recording it, the retry carries the same key; pass it to the transport (an `Idempotency-Key` header, a hidden marker) so the owner gets one message.

A store lock per approval keeps replicas from sending the same notification at the same time.

## Notifiers

| Package | Delivers to | Dedupe |
|---|---|---|
| `consoleNotifier()` in `@chamvi/core` | `console.log` (or `write`), for development | none needed |
| [`@chamvi/notify-openclaw`](/reference/notify-openclaw) | An OpenClaw chat via `POST <hooks.path>/agent`. See [OpenClaw](/deployment/openclaw) | `Idempotency-Key` and a byte-identical message |
| [`@chamvi/notify-github`](/reference/notify-github) | A comment on the run's issue or pull request (or a configured `target`) | A hidden marker, looked for before posting |

Both transports bound one send to 30 s on the `IClock` (below the engine's 60 s notify lock) and cut the notification body (8 000 and 60 000 characters), so a stalled endpoint or a huge tool input never blocks `tick()` or turns into a permanent rejection. Neither carries the resume token by default: the optional `approvalUrl` link opens the run's approval in the UI (run and approval id only, no token), where a signed-in principal with `agent:<name>:approve` (plus `run:read` or `agent:<name>:run` for the UI to show the run) answers it. Of the two, only the OpenClaw message adds the token and a `resume_run` call, when `resumeTool: true` is set; a GitHub comment never carries it. `consoleNotifier()` logs the token (development only), and a notifier you write decides itself.
