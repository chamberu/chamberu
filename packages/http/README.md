<p align="center">
    <img src="https://raw.githubusercontent.com/chamberu/chamberu/master/.github/assets/logo.svg" alt="@chamberu/http" width="128" height="128" />
</p>

<h1 align="center">@chamberu/http</h1>

<p align="center">
    <b>REST, SSE, webhooks and MCP for chamberu agents, on routup.</b><br>
    One routup App per chamberu app: humans start and follow runs over REST and SSE,<br>
    machines post webhooks with bearer tokens, and agents call runs as MCP tools.
</p>

<p align="center">
    <a href="https://www.npmjs.com/package/@chamberu/http"><img src="https://img.shields.io/npm/v/@chamberu/http" alt="npm version" /></a>
    <a href="https://github.com/chamberu/chamberu/actions/workflows/ci.yml"><img src="https://github.com/chamberu/chamberu/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="https://github.com/chamberu/chamberu/blob/master/packages/http/LICENSE"><img src="https://img.shields.io/npm/l/@chamberu/http" alt="License" /></a>
</p>

---

**Table of Contents**
- [Installation](#installation)
- [Usage](#usage)
- [Endpoints](#endpoints)
- [Permissions](#permissions)
- [Authenticators](#authenticators)
- [Triggers](#triggers)
- [MCP tools](#mcp-tools)
- [Operations](#operations)
- [Shutdown](#shutdown)
- [Options](#options)
- [API](#api)
- [License](#license)

## Installation

```bash
npm install @chamberu/http @chamberu/core --save
```

ESM only, Node.js `>=22`. `@chamberu/core` is a peer dependency; [routup](https://www.npmjs.com/package/routup) v6, the [MCP TypeScript SDK](https://www.npmjs.com/package/@modelcontextprotocol/server) v2, [vouchly](https://www.npmjs.com/package/vouchly) and the authup server adapter are installed with the package.

## Usage

`createHttpApp()` returns a routup `App`; `app.fetch(request)` answers any WHATWG `Request`, and routup's `serve()` listens on a port:

```typescript
import type { LanguageModel } from 'ai';
import {
    MemoryStore,
    RunEngine,
    defineAgent,
    http,
} from '@chamberu/core';
import { createHttpApp, createShutdown, staticTokens } from '@chamberu/http';

export async function createAgentServer(model: LanguageModel) {
    const echo = defineAgent({
        name: 'echo',
        model,
        instructions: 'Answer with a short summary of the payload.',
        // http() lets REST (POST /agents/echo/runs) and MCP (run_echo) start runs
        triggers: [http()],
    });

    const agents = [echo];
    const store = new MemoryStore();
    const engine = new RunEngine({
        store,
        agents,
        resumeSecret: 'change-me',
    });

    const token = process.env.CHAMBERU_TOKEN;
    if (!token) throw new Error('Set CHAMBERU_TOKEN (at least 16 characters).');

    const shutdown = createShutdown({ engine });
    const app = createHttpApp({
        engine,
        store,
        agents,
        auth: staticTokens({ tokens: { [token]: { id: 'ci', permissions: ['*'] } } }),
        shutdown,
    });

    await engine.start();

    // serve it with routup (srvx); let createShutdown own SIGTERM:
    // const server = serve(app, { port: 3000, gracefulShutdown: false });
    // process.once('SIGTERM', () => shutdown.shutdown());
    return {
        app,
        engine,
        shutdown,
    };
}
```

Every route answers JSON. Errors are always `{ status, code, message, issues? }` (for unmatched routes too); a 5xx body says `Internal Server Error` and the cause goes to `onError`. Every 401 carries `WWW-Authenticate: Bearer`.

## Endpoints

Paths are relative to `basePath` (default none).

| Method and path | Permission | Answer |
|---|---|---|
| `POST /agents/:name/runs` | `agent:<name>:run` | `202 { runId, deduplicated }`; body `{ payload?, idempotencyKey?, thread? }`, the key also as an `Idempotency-Key` header; the agent must declare `http()` |
| `GET /runs` | `run:read`, or `agent:<agent>:run` with `filter[agent]=<agent>` | `200 { data, meta: { total, limit, offset } }` |
| `GET /runs/:id` | `run:read` or `agent:<run.agent>:run` | `200` the run plus its `steps` |
| `GET /runs/:id/stream` | as `GET /runs/:id` | SSE: `run.updated`, `step.appended` (`id` = step index), `ping`; ends once the run settled |
| `POST /runs/:id/cancel` | `run:cancel` | `202 { runId, status }` |
| `POST /resume` | `agent:<run.agent>:approve` | `202 { runId, status: 'queued' }`; body `{ token, approved, reason? }` |
| `POST /hooks/:agent/:triggerId` | `agent:<agent>:run` | `202 { runId, deduplicated }`; the whole body is the payload |
| `GET /agents` | `run:read` | `200 { data: AgentSummary[] }`: triggers (with each webhook's `hook` path), budget, approvals, state collections |
| `GET /schedules` | `run:read` | `200 { data: ScheduleSummary[] }`: every `cron()` trigger with its next fire time (from the definitions, not from a running scheduler) |
| `GET /agents/:name/state/kv/:key` | `state:read` | `200 { key, value }` (`null` when unset) |
| `PATCH /agents/:name/state/kv/:key` | `state:write` | `200 { key, value }`; body `{ value }` |
| `GET /agents/:name/state/collections/:collection` | `state:read` | `200 { data }`, each document `{ id, ...fields }` (a non-object document as `{ id, doc }`); top-level equality filters (`filter[status]=open`), `page[limit]`; a `page[offset]` above 0 is 400 (the store pages by limit only) |
| `/mcp` | authenticated | The MCP endpoint (see [MCP tools](#mcp-tools)) |
| `GET /healthz` | none | `200 { status: 'ok' }` |
| `GET /readyz` | none | `200`, or `503 { status: 'unavailable', reason }` with `shutting-down`, `draining` or `store-unreachable` |
| `GET /metrics` | none | Prometheus text format |

`GET /runs` takes the [rapiq](https://www.npmjs.com/package/@rapiq/codec-url) URL syntax: `filter[agent]=triage`, `filter[status]=queued,running`, `page[limit]=20` (default 50, at most 100), `page[offset]=40` and `sort=createdAt` (the only order, oldest first). The expression dialect works too (`filter=eq(agent,'triage')`); only filters joined with `and` are supported. Unknown keys, operators and sorts answer 400.

Bodies are JSON (`application/json` or `*+json`), at most `bodyLimit` bytes (413 above, 415 for another media type). A protected route checks the bearer token before it reads the body, so an unauthenticated client cannot make the server buffer it. Unknown body keys are dropped without an error.

`GET /runs/:id` answers 404 before 403, so any authenticated principal can tell whether a run id exists; run ids are random UUIDs. Runs on the wire never carry the internal `claim` (owner and lease).

The SSE stream follows the run through `engine.on` and polls the store every `stream.pollMs` (default 2 s), so it also sees a run executing on another replica. `Last-Event-ID` resumes after a step index.

## Permissions

| Permission | Grants |
|---|---|
| `agent:<name>:run` | Start runs of the agent (REST, webhooks, MCP `run_<name>`) and read them |
| `agent:<name>:approve` | Answer the agent's approvals (`POST /resume`, MCP `resume_run`) |
| `run:read` | Read and list every run, the agents and the schedules |
| `run:cancel` | Cancel runs |
| `state:read`, `state:write` | Read and write agent state |
| `*` | Everything |

A `*` segment matches exactly one segment: `agent:*:run` grants `agent:triage:run` but not `agent:triage:approve`, and `agent:*` grants neither. Matching is case-sensitive. `hasPermission(principal, permission)` and `agentPermission(agent, action)` are exported.

`POST /resume` needs authentication **and** the approve permission: the resume token alone is not enough. The token's signature and expiry are checked before any store lookup (a forged or expired token answers 400 without touching the store).

## Authenticators

`auth` takes one authenticator or a chain; the first principal wins. An authenticator resolves `undefined` for a request it does not recognize (the chain continues) and throws a 401 for credentials it rejects.

```ts
const ciToken = process.env.CI_TOKEN;
auth: [
    // static tokens first: authup() in remote mode introspects every non-JWT bearer
    ...(ciToken ? [staticTokens({ tokens: { [ciToken]: { id: 'ci', permissions: ['agent:deploy:run'] } } })] : []),
    // an authup TokenVerifier in remote mode (with a creator), so tokens carry their grants
    authup({ verifier }),
    oidc({ issuers: [githubActions], principal: mapGithubClaims }),
],
```

- **`staticTokens({ tokens })`**: bearer tokens of at least 16 characters, compared by SHA-256 digest. Fits CI and service accounts. Put it **before** `authup()` and `oidc()`: `authup()` in remote mode sends every bearer that is not a JWT to the authup server's introspection endpoint, so a static token placed after it leaks to that server on every request.
- **`authup({ verifier })`**: verifies through `@authup/server-adapter-web`. A token grants its permissions only when its `scope` contains `global`; other tokens keep their identity but grant nothing (so they answer 403). Local verification always yields no permissions: grants need remote mode (`creator`, introspection). Permission `policies`, `realm_id` and `client_id` are not evaluated. Caching: a cached result is served until the token's `exp`, so in local mode it outlives a disabled signing key and in remote mode a revoked token (`maxRemoteCacheTTL` bounds remote caching); without `cache`, nothing is cached.
- **`oidc({ issuers, principal })`**: any OIDC issuer through vouchly, e.g. GitHub Actions tokens. `principal` is **required** and maps the verified claims to a principal (or `undefined` to refuse it): a public issuer lets anyone mint a token for your audience, so the deployment decides which `sub` or `repository` gets which grants. A token from an issuer that is not configured passes to the next authenticator; an unreachable issuer answers 503.

## Triggers

- **`http({ schema? })`** is the control-plane trigger (id `http`, at most one per agent). REST `POST /agents/:name/runs` starts runs through it (envelope source `http`), and so does MCP `run_<name>` (source `mcp`). An agent without `http()` answers 404 on REST and gets no MCP tool. `schema` (any Standard Schema) validates the payload; failures answer 400 with `issues`.
- **`webhook({ path, schema?, idempotencyKey?, concurrencyKey? })`** (id `webhook:<path>`, many per agent) is served at `POST /hooks/:agent/:triggerId` with the URL-encoded id, e.g. `/hooks/intake/webhook%3A%2Fissues` (`GET /agents` lists each `hook` path). The body may be any JSON value. The idempotency key comes from the `Idempotency-Key` header, else from `idempotencyKey(payload)`; retried deliveries with one key create one run. The hook answers 202 right away and never runs the agent synchronously. Signature-verified webhooks (GitHub) are a separate package.

## MCP tools

`/mcp` is a streamable HTTP MCP endpoint (MCP TypeScript SDK v2; 2025-era clients are served statelessly) with the same bearer authentication as REST. The tools a client sees depend on its principal:

| Tool | Input | Answer |
|---|---|---|
| `run_<agent>` | `{ payload?, idempotencyKey?, thread?, waitSeconds? }` | `{ runId, status, deduplicated, output?, error?, waiting? }` |
| `get_run` | `{ runId }` | The run (as `GET /runs/:id`, without steps) |
| `list_runs` | `{ agent?, status?, limit?, offset? }` | `{ data: RunSummary[], total }` |
| `resume_run` | `{ token, approved, reason? }` | `{ runId, status: 'queued' }` |

- `run_<agent>` is listed for each agent with an `http()` trigger the principal may run; its `payload` carries the trigger schema's JSON Schema. `waitSeconds` (default 0) waits for `completed`, `failed`, `cancelled` or `waiting`, at most `mcp.maxWaitSeconds` (default 60; larger values are clamped). The wait polls the store every second, so it sees a run executing on another replica, and stops when the client goes away. A `waiting` answer names the tool and input, never the resume token.
- Idempotency keys are scoped per agent and source: an MCP start dedupes under `<agent>:mcp`, a REST start under `<agent>:http`, so one key used over both creates two runs.
- `get_run` and `list_runs` follow the REST read rule; denied permissions and unknown runs come back as tool errors (`isError`).

## Operations

- **`/metrics`** is unauthenticated (scrapers rarely send bearer tokens): keep it off the public ingress (a NetworkPolicy, or a separate internal listener), or disable it with `metrics: false`. Each app gets its own `prom-client` `Registry`; SSE streams are not timed.
- **Rate limit**: 300 requests per minute per client address by default, `/healthz`, `/readyz`, `/metrics` and CORS preflights excluded. The key is the socket address unless `trustProxy` is set: behind a reverse proxy, set it (e.g. `'loopback'` or a hop count) or every client shares the proxy's bucket; `X-Forwarded-For` is never trusted otherwise. Without a socket address (in-process `app.fetch`, unix sockets) all clients share one bucket.
- **CORS** is off unless `cors` is given (`@routup/cors` options).
- **Readiness** fails while shutting down, while the engine drains, or when the store does not answer within `readyTimeoutMs`.

## Shutdown

`createShutdown()` runs the shutdown in order: fail readiness, wait `readinessDelayMs`, stop the scheduler, end open SSE streams and close MCP (the app registers that; new streams and MCP requests then answer 503), stop accepting connections, `engine.drain()`, then wait at most `closeTimeoutMs` for open connections before closing them. Pass `gracefulShutdown: false` to `serve()` so srvx does not install its own signal handler:

```ts
import { serve } from 'routup';

let server: ReturnType<typeof serve> | undefined;
const shutdown = createShutdown({
    engine,
    scheduler,
    // the server is created after the app; the helper only calls close() at shutdown
    server: { close: async (force) => { await server?.close(force); } },
});
const app = createHttpApp({ engine, store, agents, auth, shutdown });
server = serve(app, { port: 3000, gracefulShutdown: false });

process.once('SIGTERM', () => {
    void shutdown.shutdown();
});
```

`shutdown.onShutdown(fn)` adds your own cleanup; it runs after the scheduler stopped and before the server closes.

## Options

`createHttpApp(options)`:

| Option | Type | Default | Description |
|---|---|---|---|
| `engine` | `RunEngine` | required | Dispatches, cancels and resumes runs |
| `store` | `IStore` | required | The engine's store: runs, steps and state are read from it |
| `agents` | `Agent[]` | required | The engine's agents |
| `auth` | `Authenticator \| Authenticator[]` | required | The authenticator chain |
| `basePath` | `string` | none | Prefix of every route, e.g. `/api` |
| `trustProxy` | routup trust-proxy input | none | Which proxies the client address (and the rate-limit key) trusts |
| `shutdown` | `IShutdown` | none | Fails `/readyz` and ends streams on shutdown |
| `bodyLimit` | `number` | `1_048_576` | Bytes a REST or MCP request body may have |
| `stream.pollMs` | `number` | `2_000` | Store poll of SSE streams |
| `mcp` | `false \| { name?, version?, maxWaitSeconds? }` | `chamberu`, `0.0.0`, `60` | MCP server info and wait cap; `false` mounts nothing |
| `cors` | `false \| CorsOptions` | off | `@routup/cors` options |
| `rateLimit` | `false \| Partial<RateLimitOptions>` | 300 per minute | `@routup/rate-limit` options |
| `metrics` | `false \| Partial<PrometheusOptions>` | `/metrics` | `@routup/prometheus` options |
| `readyTimeoutMs` | `number` | `2_000` | How long `/readyz` waits for the store |
| `clock` | `IClock` | `systemClock` | Drives polls, waits and timeouts |
| `onError` | `(error) => void` | `console.error` | 5xx causes and background failures |

`createShutdown(options)`:

| Option | Type | Default | Description |
|---|---|---|---|
| `engine` | `RunEngine` | required | Drained during the shutdown |
| `scheduler` | `{ stop(): Promise<void> }` | none | Stopped first, e.g. `createScheduler()` from `@chamberu/scheduler` |
| `server` | `{ close(force?): Promise<void> }` | none | The srvx server |
| `readinessDelayMs` | `number` | `0` | Time for load balancers to see the failing readiness |
| `drainTimeoutMs` | `number` | `30_000` | Passed to `engine.drain()` |
| `closeTimeoutMs` | `number` | `5_000` | Wait for open connections, then close them |
| `clock` | `IClock` | `systemClock` | Drives the delays |
| `onError` | `(error) => void` | `console.error` | Failing callbacks and closes |

## API

| Export | Kind | Purpose |
|---|---|---|
| `createHttpApp` | function | Builds the routup App |
| `createShutdown` | function | The graceful shutdown helper |
| `staticTokens`, `authup`, `oidc` | function | Authenticators |
| `hasPermission`, `agentPermission` | function | Permission matching |
| `Permission` | constant | `ALL`, `RUN_READ`, `RUN_CANCEL`, `STATE_READ`, `STATE_WRITE` |
| `DEFAULT_SHUTDOWN_DRAIN_TIMEOUT_MS`, `DEFAULT_SHUTDOWN_CLOSE_TIMEOUT_MS` | constant | `30_000`, `5_000` |

Types: `HttpAppOptions`, `McpOptions`, `CorsOptions`, `RateLimitOptions`, `PrometheusOptions`, `TrustProxyInput`, `Principal`, `Authenticator`, `PermissionName`, `AgentAction`, `StaticTokensOptions`, `AuthupOptions`, `OidcOptions`, `IShutdown`, `ShutdownOptions`, `RunView`, `RunListQuery`, `RunSummary`, `RunToolResult`, `AgentSummary`, `ScheduleSummary`.

## License

Published under [Apache License 2.0](./LICENSE).
