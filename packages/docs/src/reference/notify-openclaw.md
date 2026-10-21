# @chamvi/notify-openclaw

The OpenClaw notifier. The public API of `packages/notify-openclaw/src/index.ts`.

```bash
npm install @chamvi/notify-openclaw @chamvi/core --save
```

`@chamvi/core` is a peer dependency; the notifier uses the global `fetch`. See [OpenClaw](/deployment/openclaw) for the setup.

## openclaw

```ts
function openclaw(options: OpenclawNotifierOptions): INotifier;

const DEFAULT_HOOKS_PATH: '/hooks';
const OPENCLAW_TIMEOUT_MS: 30_000;
const OPENCLAW_REQUEST_ERROR_CODE: 'openclaw_request';
const MESSAGE_BODY_MAX_LENGTH: 8_000;
```

<<< ../../../notify-openclaw/src/notifier/types.ts#public{ts}

Throws `InvalidAgentDefinitionError` for an empty `name`, `hooksToken`, `agentId`, `deliver.to` or `deliver.accountId`, a `deliver.channel` that is empty or `last`, a `baseUrl` that is no absolute `http:`/`https:` URL or carries credentials, a query or a hash, a `hooksPath` that does not start with `/` or is `/`, a `resumeUrl` that is no function and a `timeoutMs` that is no positive integer.

<<< @/snippets/notify-openclaw.ts#notifier

### The request

`notify(n, { idempotencyKey })` sends one `POST <baseUrl><hooksPath>/agent`:

| Part | Value |
|---|---|
| `authorization` | `Bearer <hooksToken>` |
| `idempotency-key` | `idempotencyKey`, or `sha256:<hex>` of it when it is longer than 256 characters or holds anything but visible ASCII |
| body | `OpenclawHookBody`: `{ message, name: 'chamvi', agentId?, deliver: true, channel, to, accountId? }` |

The message is deterministic for one notification (no clock value, no random id), so a resend after a lost response is byte-identical and OpenClaw replays it:

```
chamvi notification. Relay it to the user; keep every link, id and token exactly as written.

<title>

<body, cut to MESSAGE_BODY_MAX_LENGTH characters>

Agent: <agent>
Run: <runId>

Expires: <expiresAt ISO>
Approve or deny: <resumeUrl(token)>
Or call the chamvi MCP tool resume_run with {"token":"<token>","approved":true} to approve, or "approved":false to deny.
```

The last block is sent for approvals only; `Approve or deny` only with `resumeUrl`. A cut body ends with `… (cut, <n> more characters)` and never splits a surrogate pair.

### Failures

Any 2xx resolves. Every other status throws a `ChamviError` with `code` `openclaw_request` and the message `OpenClaw <status>: <response text>` (plus `(retry after <value>)` for a `Retry-After` header); a network failure throws `OpenClaw request failed: <cause>`, a send that takes longer than `timeoutMs` `OpenClaw did not answer within <ms>ms.` (the timer runs on the `clock` and aborts the `fetch`). The response text is cut to 500 characters after the hooks token and the resume token were replaced by `[redacted]`, so an endpoint that echoes the request never puts either into `onError`.
