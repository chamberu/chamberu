# Notifiers

A notifier delivers messages from the engine to the owner: today approval requests, later "stuck" pings and results. It is a small interface you implement or install.

<<< ../../../core/src/notify/types.ts{ts}

| `Notification` field | Description |
|---|---|
| `kind` | `approval`, `stuck`, `result` or `info`. The core engine sends `approval` |
| `agent`, `runId` | Who is asking |
| `title`, `body` | Human-readable text. For approvals the body shows the tool name and its input as JSON |
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

`consoleNotifier()` from `@chamvi/core` logs each notification and an approval's resume token, for development:

```ts
import { Engine, consoleNotifier } from '@chamvi/core';

const engine = new Engine({ store, agents, resumeSecret, notifiers: { owner: consoleNotifier() } });
```

It takes `name` (default `console`) and `write(line)` (default `console.log`) and never throws.

## Writing a notifier

<<< @/snippets/notifiers.ts#console

A notifier that talks to a remote service:

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

Both transports bound one send to 30 s on the `IClock` (below the engine's 60 s notify lock) and cut the notification body (8 000 and 60 000 characters), so a stalled endpoint or a huge tool input never blocks `tick()` or turns into a permanent rejection. The GitHub comment never carries the resume token; the OpenClaw message, a private chat, does.
