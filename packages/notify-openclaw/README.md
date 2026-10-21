<p align="center">
    <img src="https://raw.githubusercontent.com/chamvi/chamvi/master/.github/assets/logo.svg" alt="@chamvi/notify-openclaw" width="128" height="128" />
</p>

<h1 align="center">@chamvi/notify-openclaw</h1>

<p align="center">
    <b>OpenClaw notifier for chamvi agents.</b><br>
    Approval requests reach the owner in an OpenClaw chat,<br>
    once per approval, even when the engine retries the send.
</p>

<p align="center">
    <a href="https://www.npmjs.com/package/@chamvi/notify-openclaw"><img src="https://img.shields.io/npm/v/@chamvi/notify-openclaw" alt="npm version" /></a>
    <a href="https://github.com/chamvi/chamvi/actions/workflows/ci.yml"><img src="https://github.com/chamvi/chamvi/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="https://github.com/chamvi/chamvi/blob/master/packages/notify-openclaw/LICENSE"><img src="https://img.shields.io/npm/l/@chamvi/notify-openclaw" alt="License" /></a>
</p>

---

**Table of Contents**
- [Installation](#installation)
- [OpenClaw setup](#openclaw-setup)
- [Usage](#usage)
- [Answering approvals](#answering-approvals)
- [Caveats](#caveats)
- [Options](#options)
- [API](#api)
- [License](#license)

## Installation

```bash
npm install @chamvi/notify-openclaw @chamvi/core --save
```

ESM only, Node.js `>=22`. `@chamvi/core` is a peer dependency; the notifier uses the global `fetch` and has no runtime dependencies.

chamvi and OpenClaw talk **"MCP in, hooks out"**: OpenClaw starts and answers runs through the app's MCP endpoint (`@chamvi/http`), and chamvi pushes notifications to OpenClaw's hooks endpoint through this package.

## OpenClaw setup

In the OpenClaw gateway configuration:

1. Enable hooks (`hooks.enabled: true`; they are off by default) and set a **dedicated `hooks.token`**. It is not the gateway token; the notifier sends it as `Authorization: Bearer <token>`.
2. Keep `hooks.path` at `/hooks` or pass the same value as `hooksPath`.
3. When you pass `agentId`, list it in `hooks.allowedAgentIds`.
4. Add the chamvi app's MCP endpoint (`http://<service>/mcp`) to OpenClaw's `mcp.servers`, with a bearer token of a principal holding `agent:<name>:approve` (and `agent:<name>:run` to start runs), so the owner can answer from the chat. Read [Answering approvals](#answering-approvals) first: with that grant the OpenClaw agent can approve on its own.

## Usage

`openclaw()` is an `INotifier`; register it on the engine and name it in the agent's `notify`:

```typescript
import { tool } from 'ai';
import type { LanguageModel } from 'ai';
import { z } from 'zod';
import {
    Engine,
    MemoryStore,
    defineAgent,
    http,
} from '@chamvi/core';
import { openclaw } from '@chamvi/notify-openclaw';
import type { OpenclawNotifierOptions } from '@chamvi/notify-openclaw';

export function createApprovalEngine(
    model: LanguageModel,
    options: Pick<OpenclawNotifierOptions, 'fetch' | 'clock'> = {},
): Engine {
    const {
        OPENCLAW_URL,
        OPENCLAW_HOOKS_TOKEN,
        OPENCLAW_CHANNEL,
        OPENCLAW_TO,
        RESUME_SECRET,
        APP_URL,
    } = process.env;
    if (!OPENCLAW_URL || !OPENCLAW_HOOKS_TOKEN || !OPENCLAW_CHANNEL || !OPENCLAW_TO || !RESUME_SECRET || !APP_URL) {
        throw new Error('Set OPENCLAW_URL, OPENCLAW_HOOKS_TOKEN, OPENCLAW_CHANNEL, OPENCLAW_TO, RESUME_SECRET and APP_URL.');
    }

    const deploy = tool({
        description: 'Deploy the current release to an environment.',
        inputSchema: z.object({ env: z.enum(['staging', 'prod']) }),
        execute: async ({ env }) => `deployed to ${env}`,
    });

    const deployer = defineAgent({
        name: 'deployer',
        model,
        instructions: 'Deploy the release the user asks for.',
        triggers: [http()],
        tools: { deploy },
        // every deploy waits for the owner, who is asked in the chat
        approvals: { deploy: 'user' },
        notify: 'openclaw',
    });

    return new Engine({
        store: new MemoryStore({ clock: options.clock }),
        agents: [deployer],
        notifiers: {
            openclaw: openclaw({
                baseUrl: OPENCLAW_URL,
                // OpenClaw's hooks.token, not the gateway token
                hooksToken: OPENCLAW_HOOKS_TOKEN,
                deliver: { channel: OPENCLAW_CHANNEL, to: OPENCLAW_TO },
                // the message carries only this link; resumeTool: true would add the token itself
                resumeUrl: (token) => `${APP_URL}/ui/approvals?token=${encodeURIComponent(token)}`,
                ...options,
            }),
        },
        resumeSecret: RESUME_SECRET,
        clock: options.clock,
    });
}
```

Each approval becomes one `POST <baseUrl><hooksPath>/agent` with the body `{ message, name: 'chamvi', agentId?, deliver: true, channel, to, accountId? }`, the hooks token as bearer token and the engine's idempotency key (`<runId>:<approvalId>`) as `Idempotency-Key`. The message holds the notification's title, its body (cut to 8 000 characters), the agent and the run id; for an approval also the expiry and the `resumeUrl` link when configured (without it, a line saying to answer in the chamvi UI or through its MCP server). Only with `resumeTool: true` does it also carry the token itself and a ready-made `resume_run` call.

Any 2xx response counts as sent (OpenClaw answers `200 { ok: true, runId }` once it admitted the hook). Every other answer throws a `ChamviError` with code `openclaw_request` (`OpenClaw <status>: <response text>`, with `retry after <s>` for a `Retry-After`), as does a network failure (`OpenClaw request failed: <message> (<cause>)`, the cause naming e.g. `ECONNREFUSED` or `ENOTFOUND`) and a gateway that does not answer within `timeoutMs` (30 s). The engine reports it to `onError` and sends again on the next poll, with the same key and a byte-identical body, until one send succeeds.

## Answering approvals

By default the message never carries the resume token or a `resume_run` call:

- **A link** (`resumeUrl(token)`), when configured, e.g. into the chamvi UI's approvals inbox. The link holds the token; `POST /resume` still requires `agent:<agent>:approve`.
- Without `resumeUrl`, the message says to answer in the chamvi UI or through its MCP server, and carries no token (neither in the body nor in a header).

With **`resumeTool: true`** the message also carries the MCP call `resume_run` with `{"token":"<token>","approved":true}` (or `"approved":false`), so OpenClaw's agent can answer through its MCP connection to the app. The message asks the OpenClaw agent to keep every link, id and token exactly as written.

**With `resumeTool: true` the OpenClaw agent holds the token and the `resume_run` call.** The notification body is the tool input as the model wrote it, which may repeat untrusted text (an issue body, a mail); an injected instruction there reaches the OpenClaw agent next to the token. When the OpenClaw principal holds `agent:<name>:approve`, an agent turn that follows such an instruction approves the tool call without the owner (the run then records the OpenClaw principal as approver). Turn `resumeTool` on (and grant `agent:<name>:approve` to the hook-relay agent) only when you accept that; otherwise keep the default, or let a separate, restricted OpenClaw agent (`agentId`, without the chamvi MCP server) relay the hooks, and answer through the `resumeUrl` link. Even by default the link holds the token, so an agent that can open links could follow it; `POST /resume` then still needs a principal with `agent:<name>:approve`.

## Caveats

- OpenClaw runs an agent turn on the message (it does not post raw text) and treats it as external content, so the wording in the chat is the OpenClaw agent's.
- OpenClaw's idempotency replay lives in memory and lasts 5 minutes after the run completed; a restart clears it. chamvi's `waiting.notifiedAt` (and its per-approval lock) is the primary dedupe; the key only covers a response lost within those minutes.
- A misconfigured hook (400, 401, 404) fails on every poll and reaches `onError` each time, until it is fixed or the approval times out.
- OpenClaw ignores an `Idempotency-Key` over 256 characters; such keys (and keys with whitespace or non-ASCII characters) are sent as `sha256:<hex>`.
- Errors never carry the hooks token or the resume token: both are replaced by `[redacted]` in the response text and the network failure message, each cut to 500 characters. A `hooksToken` that `fetch` could not send as a header (control characters, characters above U+00FF, surrounding whitespace) is refused when `openclaw()` is called.

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `baseUrl` | `string` | required | The gateway, e.g. `http://openclaw:18789`; an absolute `http:`/`https:` URL without credentials, query or hash. A base path is kept |
| `hooksToken` | `string` | required | OpenClaw's `hooks.token`; a valid header value (no control characters, nothing above U+00FF, no surrounding whitespace) |
| `deliver` | `{ channel, to, accountId? }` | required | Where OpenClaw delivers the answer; `channel` and `to` must be concrete (`last` is refused) |
| `name` | `string` | `'openclaw'` | The notifier name an agent's `notify` references |
| `hooksPath` | `string` | `'/hooks'` | OpenClaw's `hooks.path`; starts with `/`, not `/` itself; trailing slashes are dropped |
| `agentId` | `string` | none | The OpenClaw agent that phrases the message |
| `resumeUrl` | `(token) => string` | none | A link answering an approval, added to approval messages |
| `resumeTool` | `boolean` | `false` | Also put the resume token and a `resume_run` MCP call into approval messages (see [Answering approvals](#answering-approvals)) |
| `timeoutMs` | `number` | `30_000` | Bound of one send, on the `clock` |
| `clock` | `IClock` | `systemClock` | Time source of the timeout |
| `fetch` | `typeof fetch` | `globalThis.fetch` | The HTTP client (tests pass a fake) |

Every option is checked when `openclaw()` is called; a bad one throws `InvalidAgentDefinitionError`.

## API

| Export | Kind | Purpose |
|---|---|---|
| `openclaw` | function | `openclaw(options)`: an `INotifier` posting to OpenClaw's hooks endpoint |
| `DEFAULT_HOOKS_PATH` | constant | `'/hooks'` |
| `OPENCLAW_TIMEOUT_MS` | constant | `30_000`, the default `timeoutMs` |
| `OPENCLAW_REQUEST_ERROR_CODE` | constant | `'openclaw_request'`, the `code` of every send failure |
| `MESSAGE_BODY_MAX_LENGTH` | constant | `8_000`, the cut of `Notification.body` in the message |

Types: `OpenclawNotifierOptions`, `OpenclawDelivery`, `OpenclawHookBody`.

## License

Made with 💚

Published under [Apache License 2.0](./LICENSE).
