# @chamberu/http

REST, SSE, webhooks and MCP for chamberu agents, on routup. The public API of `packages/http/src/index.ts`.

```bash
npm install @chamberu/http @chamberu/core --save
```

`@chamberu/core` is a peer dependency. See [HTTP API & MCP](/guide/http) for the behaviour.

## createHttpApp

```ts
function createHttpApp(options: HttpAppOptions): App; // routup App
```

The store, the agents and the clock come from `engine` (`engine.store`, `engine.listAgents()`, `engine.clock`). Throws `InvalidAgentDefinitionError` for an empty `auth` array and an invalid `routes` entry (a path that is not static, a duplicate method and path, a first segment of a built-in route such as `agents`, `runs` or `hooks`, or the metrics path, all compared case-insensitively).

<<< ../../../http/src/app/types.ts#options{ts}

`routes` takes extra routes from other packages, such as the GitHub webhook of `@chamberu/github`:

<<< ../../../http/src/app/types.ts#routes{ts}

## Authenticators

```ts
type Authenticator = (request: Request) => Promise<Principal | undefined>;

function staticTokens(options: StaticTokensOptions): Authenticator;
function authup(options: AuthupOptions): Authenticator;
function oidc(options: OidcOptions): Authenticator;
```

An authenticator resolves `undefined` for a request it does not recognize and throws a 401 for credentials it rejects. `staticTokens` throws `InvalidAgentDefinitionError` for an empty map or a token shorter than 16 characters; `oidc` for an empty `issuers` list, an issuer without `audience` or a missing `principal`.

<<< ../../../http/src/auth/types.ts{ts}

## Permissions

```ts
const Permission: {
    ALL: '*';
    RUN_READ: 'run:read';
    RUN_CANCEL: 'run:cancel';
    STATE_READ: 'state:read';
    STATE_WRITE: 'state:write';
};

function agentPermission(agent: string, action: 'run' | 'approve'): string; // agent:<agent>:<action>
```

Matching uses core's [`hasPermission(principal.permissions, permission)`](/reference/#permissions): true for a granted `*`, or for a grant with the same number of `:` segments whose every segment is equal or `*`.

## createShutdown

```ts
function createShutdown(options: ShutdownOptions): IShutdown;

const DEFAULT_SHUTDOWN_DRAIN_TIMEOUT_MS: 30_000;
const DEFAULT_SHUTDOWN_CLOSE_TIMEOUT_MS: 5_000;
```

<<< ../../../http/src/shutdown/types.ts{ts}

## Wire types

```ts
type InvokerView = Omit<Invoker, 'permissions'>;
type RunView = Omit<Run, 'claim' | 'trigger'> & {
    trigger: Omit<TriggerEnvelope, 'invoker'> & { invoker?: InvokerView };
};
type RunSummary = Pick<Run, 'id' | 'agent' | 'status' | 'createdAt' | 'finishedAt' | 'error'>;
type RunToolResult = {
    runId: string;
    status: RunStatusLiteral;
    deduplicated: boolean;
    output?: unknown;
    error?: { code: string; message: string };
    waiting?: { toolName: string; input: unknown; expiresAt: string };
};
```

`AgentSummary` and `ScheduleSummary` are the items of `GET /agents` and `GET /schedules`:

<<< ../../../http/src/agents/types.ts#summaries{ts}
