# OpenClaw

OpenClaw is a personal assistant gateway that connects chat channels to agents. chamvi's integration contract is **"MCP in, hooks out"**.

## MCP in

Each chamvi app serves an MCP endpoint at `/mcp` (Streamable HTTP, from [`@chamvi/http`](/guide/http#mcp)). OpenClaw lists it among its MCP servers and gets:

- one `run_<agent>` tool per agent with an `http()` trigger, which starts a run and returns the run id (or, with `waitSeconds`, waits up to a minute and returns the output or the pending approval),
- `get_run` and `list_runs` for status,
- `resume_run` to answer an approval with its token and a decision.

The endpoint uses the same bearer-token authentication as the REST API; give OpenClaw a principal with `agent:<name>:run`, which also lets it read the runs it starts. Add `agent:<name>:approve` only when you set `resumeTool: true` and accept that the OpenClaw agent can then approve on its own: it reads the resume token in every message with `resumeTool` or a `resumeUrl` link, and `resume_run` is always offered (see the warning under [Hooks out](#hooks-out)). This is how the owner says "what's relevant in my mail today?" in a chat and gets a run started.

## Hooks out

Approval requests flow back through [`@chamvi/notify-openclaw`](/reference/notify-openclaw): `POST <openclaw><hooks.path>/agent` with OpenClaw's hooks token as bearer token, the notification's `idempotencyKey` as `Idempotency-Key` header and the delivery target (channel and recipient):

<<< @/snippets/notify-openclaw.ts#notifier

In the OpenClaw configuration:

| Key | Value |
|---|---|
| `hooks.enabled` | `true` (hooks are off by default) |
| `hooks.token` | A dedicated token, passed as `hooksToken`; not the gateway token |
| `hooks.path` | `/hooks` (the default `hooksPath`), or the same value on both sides |
| `hooks.allowedAgentIds` | Lists the `agentId` you pass, if any |
| `mcp.servers` | The app's `/mcp` endpoint with a token of a principal holding `agent:<name>:run`; add `agent:<name>:approve` only with `resumeTool: true`, accepting that the relay agent can approve on its own (see the warning below) |

`deliver.channel` and `deliver.to` must name a concrete destination of your OpenClaw setup (OpenClaw refuses `channel: 'last'` and a partial destination for hooks); the examples use placeholders.

For approvals the message includes how to answer: the `resumeUrl` link when configured (a link into the UI's approvals inbox), else a line saying to answer in the chamvi UI or through its MCP server. By default it never carries a `resume_run` call, and the resume token only inside the `resumeUrl` link (verbatim, as its `token=` value). With `resumeTool: true` it also carries the token and a ready-made `resume_run` MCP call, so the owner can approve from the chat.

::: warning The relay agent holds the token with resumeTool or resumeUrl
The notification body is the tool input as the model wrote it and may repeat untrusted text (an issue body, a mail). OpenClaw wraps hook content as external, but that does not take tools away: with `resumeTool: true` or a `resumeUrl` link (which carries the token verbatim) an injected instruction reaches the OpenClaw agent next to the token, and the chamvi MCP server always offers `resume_run`. If that agent's MCP principal holds `agent:<name>:approve`, a turn that follows the instruction approves without the owner in either case. The safe setup is `resumeUrl` with a hook-relay OpenClaw agent (`agentId`) whose principal lacks `agent:<name>:approve`, or that has no chamvi MCP server at all; the owner answers through the link under a principal of their own. Grant the relay agent `agent:<name>:approve` (and turn `resumeTool` on) only when you accept that it can approve on its own.
:::

### Caveats

- OpenClaw runs an agent turn on the message (it does not post raw text) and treats it as external content; the message asks that agent to keep every link and id verbatim (and the token, with `resumeTool`).
- OpenClaw's idempotency replay is in memory and lasts 5 minutes after completion; a restart clears it. chamvi's `waiting.notifiedAt` and its per-approval lock are the primary dedupe, the key covers a response lost within those minutes.
- A misconfigured hook (400, 401, 404) fails on every poll and reaches `onError` each time.
- Keys over 256 characters (which OpenClaw ignores) or with characters outside visible ASCII are sent as `sha256:<hex>`.

## In the cluster

OpenClaw runs elsewhere in the cluster. It reaches each app at `http://<service>/mcp`, and the app reaches OpenClaw's hooks endpoint. Neither needs to be public.
