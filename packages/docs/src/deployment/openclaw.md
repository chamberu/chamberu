# OpenClaw <Badge type="warning" text="Planned" />

::: warning Planned
The OpenClaw notifier is planned (`@chamberu/notify-openclaw`). The MCP endpoint ships in [`@chamberu/http`](/guide/http#mcp).
:::

OpenClaw is a personal assistant gateway that connects chat channels to agents. chamberu's integration contract is **"MCP in, hooks out"**.

## MCP in

Each chamberu app serves an MCP endpoint at `/mcp` (Streamable HTTP, from [`@chamberu/http`](/guide/http#mcp)). OpenClaw lists it among its MCP servers and gets:

- one `run_<agent>` tool per agent with an `http()` trigger, which starts a run and returns the run id (or, with `waitSeconds`, waits up to a minute and returns the output or the pending approval),
- `get_run` and `list_runs` for status,
- `resume_run` to answer an approval with its token and a decision.

The endpoint uses the same bearer-token authentication as the REST API; give OpenClaw a principal with `agent:<name>:run` (and `agent:<name>:approve` where it may answer approvals), which also lets it read the runs it starts. This is how the owner says "what's relevant in my mail today?" in a chat and gets a run started.

## Hooks out

Results, approval requests and "stuck" pings flow back through the OpenClaw notifier: `POST <openclaw>/hooks/agent` with OpenClaw's hooks token as bearer token, the notifier's `idempotencyKey` as `Idempotency-Key` header, and the delivery target (channel and recipient). OpenClaw lets one of its agents phrase the message before delivering it.

For approvals the message includes how to answer: a link into the planned UI's approvals inbox, and the `resume_run` MCP tool, so the owner can approve from the chat.

## What works today

The MCP side is in place ([`@chamberu/http`](/guide/http)), and so is the core side: approval notifications go through any [`INotifier`](/guide/notifiers) with a stable idempotency key and are retried until delivered, and [`engine.resume()`](/guide/approvals) answers them. The OpenClaw notifier itself is still planned.

## In the cluster

OpenClaw runs elsewhere in the cluster. It reaches each app at `http://<service>/mcp`, and the app reaches OpenClaw's hooks endpoint. Neither needs to be public.
