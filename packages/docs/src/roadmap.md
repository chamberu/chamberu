# Roadmap

chamberu is built milestone by milestone, each defined by one real agent that has to work end to end. Everything on this page except the shipped packages is **planned**: designed, not built. There are no dates.

## Shipped

| Package | Contents |
|---|---|
| `@chamberu/core` | `defineAgent()`, trigger definitions, `RunEngine` (dispatch, scheduling, checkpoints, budgets, approvals, cancel, drain, recovery), effect tools, agent state, the `IStore` and `INotifier` contracts, `MemoryStore` |
| `@chamberu/test-kit` | `describeStoreContract`, `ControllableClock` |
| `@chamberu/scheduler` | `createScheduler()` (one locked hubwire component per `cron()` trigger, overlap policies, timezones), `runJob()` for one-shot jobs |
| `@chamberu/store-typeorm` | `TypeormStore` on Postgres, `migrateStore`, `purgeExpired`. See [TypeORM store](/stores/typeorm) |
| `@chamberu/http` | REST control API, server-sent events, webhook intake, `/healthz`, `/readyz`, `/metrics`, the MCP endpoint, static-token, authup and OIDC authentication, graceful shutdown. See [HTTP API & MCP](/guide/http) |
| `@chamberu/github` | GitHub App auth with an installation-token cache, the signed webhook route, `githubWebhook()` triggers deduplicated by delivery id, read tools and effect write tools with marker reconciliation. See [GitHub App](/deployment/github-app) |

## Milestones

### M1: issue triage end to end <Badge type="warning" text="Planned" />

On every new issue in the owner's repositories, a triage agent labels it, checks for duplicates, tries to reproduce the bug against the latest release in a sandbox and posts a first reply asking for missing details. A periodic sweep catches issues missed while the agent was down.

M1 is done only when everything it needs ships: the TypeORM store, the scheduler, the HTTP and MCP API with authentication, the GitHub connector, local and Kubernetes sandboxes with coding tools, the OpenClaw and GitHub notifiers, the UI, the CLI, the base image, the Helm chart, the template repository, and the triage agent itself, deployed with Flux.

### M2: mail digest <Badge type="warning" text="Planned" />

Every morning, and on request through OpenClaw, the owner gets a short digest: what matters today, what still needs action, what is waiting on others. Open loops are tracked in typed state collections across days. M2 adds a mail (IMAP) connector and **threaded runs**: a new run continues the conversation of an earlier one.

### M3: dependency upgrade <Badge type="warning" text="Planned" />

When Renovate opens a pull request, an agent reads the changelog of the bumped package, fixes breaking changes in a sandbox, runs the tests and pushes commits. It pings the owner only when it is stuck. M3 adds long coding runs, a Claude Code coding backend and stuck detection.

## Planned packages

| Package | Status | Purpose |
|---|---|---|
| `@chamberu/sandbox-local`, `@chamberu/sandbox-k8s` | Planned (M1) | Disposable workspaces: a temp directory for development, a locked-down pod per workspace in production |
| `@chamberu/coding` | Planned (M1) | Coding tools (read, edit, grep, bash, git diff) over a workspace |
| `@chamberu/coding-claude-code` | Planned (M3) | A coding backend that runs Claude Code inside the sandbox |
| `@chamberu/notify-openclaw` | Planned (M1) | Notifications into OpenClaw chats. See [OpenClaw](/deployment/openclaw) |
| `@chamberu/notify-github` | Planned (M1) | Notifications as issue or pull request comments |
| `@chamberu/ui` | Planned (M1) | Vue 3 dashboard: runs with live steps, approvals inbox, agent state, schedules |
| `chamberu` (CLI and deploy kit) | Planned (M1) | Umbrella package with `createApp()` and the `dev`, `build`, `start`, `run-job` and `migrate` commands, plus a base image, a Helm chart and a template repository. See [Deployment](/deployment/) |
| `@chamberu/mail` | Planned (M2) | IMAP connector and tools |

Two changes happened upstream first: a lock hook, timezone support and the scheduled time per tick shipped in [hubwire](https://github.com/tada5hi/hubwire) 0.2.2 (for the scheduler), and a fetch-native token verification in [authup](https://github.com/authup/authup) 1.0.0-beta.70 (for the HTTP API).

## Stability

chamberu is pre-1.0 and owner-first. Until M3, minor versions may break the API and the store schema.
