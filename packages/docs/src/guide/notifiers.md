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

## Registering notifiers

Register notifiers by name on the engine and reference one from an agent with `notify`:

<<< @/snippets/engine.ts#many

The engine rejects an agent whose `notify` names no registered notifier.

## Writing a notifier

<<< @/snippets/notifiers.ts#console

A notifier that talks to a remote service:

<<< @/snippets/webhook-notifier.ts#webhook

Two rules:

1. **Throw on failure.** Never swallow a failed send. The engine records `waiting.notifiedAt` only after `notify()` resolves, and retries every poll until it does.
2. **Respect `idempotencyKey`.** It is stable per logical notification (`<runId>:<approvalId>` for approvals). If the engine crashed after a successful send but before recording it, the retry carries the same key; pass it to the transport (an `Idempotency-Key` header, a hidden marker) so the owner gets one message.

A store lock per approval keeps replicas from sending the same notification at the same time.

## Planned notifiers <Badge type="warning" text="Planned" />

| Package | Delivers to |
|---|---|
| `@chamberu/notify-openclaw` | OpenClaw chats via `POST /hooks/agent` with an `Idempotency-Key`. See [OpenClaw](/deployment/openclaw) |
| `@chamberu/notify-github` | A comment on the run's issue or pull request, deduplicated by a hidden marker |
