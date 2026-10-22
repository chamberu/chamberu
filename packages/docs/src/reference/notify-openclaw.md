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

Throws `InvalidAgentDefinitionError` for an empty `name`, `hooksToken`, `agentId`, `deliver.to` or `deliver.accountId`, a `deliver.channel` that is empty or `last`, a `baseUrl` that is no absolute `http:`/`https:` URL or carries credentials, a query or a hash, a `hooksToken` that `fetch` could not send as a header (a control character, a character above U+00FF, surrounding whitespace), a `hooksPath` that does not start with `/` or is `/` (trailing slashes are dropped, so `/hooks/` posts to `/hooks/agent`), an `approvalUrl` that is no function, a `resumeTool` that is no boolean and a `timeoutMs` that is no positive integer.

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
chamvi notification. Relay it to the user; keep every link and id exactly as written.

<title>

<body, cut to MESSAGE_BODY_MAX_LENGTH characters>

Agent: <agent>
Run: <runId>

Expires: <expiresAt ISO>
Approve or deny: <approvalUrl({ runId, approvalId, agent })>
Or call the chamvi MCP tool resume_run with {"token":"<token>","approved":true} to approve, or "approved":false to deny.
```

For an approval with `resumeTool: true` the first line reads `keep every link, id and token exactly as written.` instead. The last block is sent for approvals only; `Approve or deny` only with `approvalUrl` (and a notification that carries an `approvalId`, as every engine approval does), the `resume_run` line only with `resumeTool: true`. With neither, the block ends with `Answer it in the chamvi UI (or through POST /runs/:id/approve); this message carries no resume token.` instead. `approvalUrl` gets the run id, the approval id and the agent, never the token, so by default (`resumeTool: false`) the token is nowhere in the request (URL, headers or body); see [Deployment: OpenClaw](/deployment/openclaw#hooks-out). A cut body ends with `… (cut, <n> more characters)` and never splits a surrogate pair.

### Failures

Any 2xx resolves. Every other status throws a `ChamviError` with `code` `openclaw_request` and the message `OpenClaw <status>: <response text>` (plus `(retry after <value>)` for a `Retry-After` header); a network failure throws `OpenClaw request failed: <message> (<cause message>)` (undici keeps the detail, such as `ECONNREFUSED` or `ENOTFOUND`, in `cause`), a send that takes longer than `timeoutMs` `OpenClaw did not answer within <ms>ms.` (the timer runs on the `clock` and aborts the `fetch`). The response text and the network failure message are cut to 500 characters after the hooks token and the resume token (sent with `resumeTool` only) were replaced by `[redacted]`, so an endpoint that echoes the request never puts either into `onError`.

## Context

```ts
function provideOpenclawContext(provider: IContextProvider, notifier: INotifier): void; // key 'openclaw:<notifier.name>'
function injectOpenclawContext(ctx: ToolContext, name?: string): INotifier;          // name default 'openclaw'
```

One key per notifier name: `openclawModule()` beside `openclawModule({ name: 'ops' })` provides both, `injectOpenclawContext(ctx, 'ops')` reads the second, and a name never provided throws `ContextNotProvidedError` naming `openclaw:<name>`. See [Context](/guide/tools#context-shared-instances-for-tools).

## Module

```ts
// @chamvi/notify-openclaw/module, needs @chamvi/app
function openclawModule(options?: OpenclawModuleOptions): IModule; // name 'chamvi:notifier:<name>', default name 'openclaw'
```

Reads `OPENCLAW_BASE_URL`, `OPENCLAW_HOOKS_TOKEN`, `OPENCLAW_CHANNEL`, `OPENCLAW_TO` (required), `OPENCLAW_HOOKS_PATH`, `OPENCLAW_AGENT_ID` and `OPENCLAW_ACCOUNT_ID` from `options.env ?? process.env` when it is called (options win), defaults `approvalUrl` to the dashboard link from `CHAMVI_PUBLIC_URL`, contributes the notifier to the app's notifiers and provides it on the engine in its `engineCreated` hook. `@chamvi/app` is an optional peer: the main entry never imports it.

<<< ../../../notify-openclaw/src/module/types.ts{ts}
