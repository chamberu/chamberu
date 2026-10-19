# HTTP API & MCP

[`@chamberu/http`](/reference/http) turns a chamberu app into one [routup](https://github.com/routup/routup) `App`: humans start and follow runs over REST and server-sent events, machines post webhooks with bearer tokens, and agents (OpenClaw, Claude, any MCP client) start runs as MCP tools. It also serves `/healthz`, `/readyz` and `/metrics`, and ships the graceful shutdown helper.

```bash
npm install @chamberu/http @chamberu/core --save
```

<<< @/snippets/http.ts#app

Every HTTP or MCP start ends in `engine.dispatch()`; nothing runs synchronously in a request. Errors are always JSON `{ status, code, message, issues? }`, unmatched routes included; a 5xx body says `Internal Server Error` and the cause goes to `onError`.

## Triggers decide what is reachable

| Trigger | Served at | Envelope |
|---|---|---|
| `http({ schema? })` (id `http`, at most one per agent) | `POST /agents/:name/runs`, MCP `run_<name>` | `trigger: 'http'`, source `http` (REST, UI) or `mcp` |
| `webhook({ path, schema?, idempotencyKey?, concurrencyKey? })` (id `webhook:<path>`) | `POST /hooks/:agent/:triggerId` | `trigger: 'webhook:<path>'`, source `webhook` |

An agent without `http()` answers 404 on REST and gets no MCP tool. The trigger's `schema` validates the payload; a failure answers 400 with `issues` and dispatches nothing. The webhook's `:triggerId` is URL-encoded (`/hooks/intake/webhook%3A%2Fissues`); `GET /agents` lists each `hook` path. See [Triggers & the Envelope](/guide/triggers).

## Routes

| Method and path | Permission | Answer |
|---|---|---|
| `POST /agents/:name/runs` | `agent:<name>:run` | `202 { runId, deduplicated }`; body `{ payload?, idempotencyKey?, thread? }` (or an `Idempotency-Key` header) |
| `GET /runs` | `run:read`, or `agent:<agent>:run` with `filter[agent]=<agent>` | `200 { data, meta: { total, limit, offset } }` |
| `GET /runs/:id` | `run:read` or `agent:<run.agent>:run` | The run with its `steps` |
| `GET /runs/:id/stream` | as `GET /runs/:id` | SSE |
| `POST /runs/:id/cancel` | `run:cancel` | `202 { runId, status }` |
| `POST /resume` | `agent:<run.agent>:approve` | `202 { runId, status: 'queued' }`; body `{ token, approved, reason? }` |
| `POST /hooks/:agent/:triggerId` | `agent:<agent>:run` | `202 { runId, deduplicated }` |
| `GET /agents`, `GET /schedules` | `run:read` | Agent summaries; `cron()` triggers with their next fire time |
| `GET`, `PATCH /agents/:name/state/kv/:key` | `state:read`, `state:write` | `{ key, value }` |
| `GET /agents/:name/state/collections/:collection` | `state:read` | Documents; top-level equality filters |
| `/mcp` | authenticated | MCP endpoint |
| `GET /healthz`, `/readyz`, `/metrics` | none | Liveness, readiness, Prometheus |

`GET /runs` takes rapiq's URL syntax: `filter[agent]=triage`, `filter[status]=queued,running`, `page[limit]` (default 50, at most 100), `page[offset]`, `sort=createdAt`. Bodies are JSON of at most `bodyLimit` bytes (default 1 MiB). A protected route checks the bearer token before it reads the body. Runs leave the API without their internal `claim`.

## Following a run

`GET /runs/:id/stream` sends `run.updated` with the current run, then each step as `step.appended` (`id` is the step index, so `Last-Event-ID` resumes), then live events; it ends once the run is `completed`, `failed` or `cancelled`. The engine's events only cover runs executing in this process, so the stream also polls the store every `stream.pollMs` (2 s) and sees a run that [another replica](/guide/concurrency) executes; an idle poll sends `ping`. A client that disconnects unsubscribes at once, and the app ends open streams on shutdown.

## Authentication and permissions

`auth` takes one authenticator or a chain; the first principal wins.

<<< @/snippets/http.ts#auth

- `staticTokens()`: bearer tokens of at least 16 characters.
- `authup()`: authup tokens through `@authup/server-adapter-web`. Only tokens with the `global` scope grant their permissions; others authenticate and get 403. Grants need remote verification (introspection); a cached result lives until the token's `exp`.
- `oidc()`: any OIDC issuer through [vouchly](https://github.com/tada5hi/vouchly). `principal` is required: a public issuer such as GitHub Actions lets anyone mint a token for your audience, so the mapper decides which claims get which grants.

| Permission | Grants |
|---|---|
| `agent:<name>:run` | Start the agent's runs and read them |
| `agent:<name>:approve` | Answer the agent's approvals |
| `run:read` | Read and list every run, agents and schedules |
| `run:cancel` | Cancel runs |
| `state:read`, `state:write` | Agent state |
| `*` | Everything |

A `*` segment matches exactly one segment (`agent:*:run`). A client that may start an agent's runs can follow them without `run:read`, but to list runs it must filter to that agent.

`POST /resume` needs the approve permission for the run's agent as well as the [resume token](/guide/approvals): a leaked token alone does nothing. The token's signature and expiry are checked before any store lookup.

## MCP

`/mcp` is a streamable HTTP endpoint (MCP TypeScript SDK v2; 2025-era clients are served statelessly), authenticated like REST. Each client sees the tools its principal may use:

- `run_<agent>` for each agent with `http()` it may run: `{ payload?, idempotencyKey?, thread?, waitSeconds? }`. With `waitSeconds` (capped by `mcp.maxWaitSeconds`, default 60) it waits for `completed`, `failed`, `cancelled` or `waiting` and returns the output, the error or the pending approval, never the resume token.
- `get_run`, `list_runs`: the REST read rule applies.
- `resume_run`: `{ token, approved, reason? }`, with the approve permission.

An MCP start dedupes its `idempotencyKey` under `<agent>:mcp`, a REST start under `<agent>:http`. A client registers the endpoint like any HTTP MCP server:

<<< @/snippets/http.ts#mcp

This is the "MCP in" half of the [OpenClaw](/deployment/openclaw) integration.

## Operations

- `/metrics` is unauthenticated: keep it off the public ingress (a NetworkPolicy, or an internal listener) or set `metrics: false`. Each app has its own `prom-client` registry; SSE streams are not timed.
- The rate limit (300 requests per minute per client, health, metrics and CORS preflights excluded) keys on the socket address. Behind a reverse proxy set `trustProxy`, or every client shares the proxy's bucket; `X-Forwarded-For` is never trusted otherwise.
- CORS is off unless `cors` is given.
- `/readyz` fails while shutting down, while the engine drains and when the store does not answer within `readyTimeoutMs` (2 s).

## Shutdown

<<< @/snippets/http.ts#shutdown

`createShutdown()` fails readiness, waits `readinessDelayMs` for load balancers, stops the scheduler, runs the `onShutdown` callbacks (the app ends its SSE streams and closes MCP there; new streams and MCP requests then answer 503), stops accepting connections, drains the engine (`drainTimeoutMs`, 30 s) and waits at most `closeTimeoutMs` (5 s) for open connections before closing them. Every call returns the same promise. Pass `gracefulShutdown: false` to `serve()` so srvx does not handle the signal itself.
