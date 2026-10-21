# Roadmap

chamvi is built milestone by milestone, each defined by one real agent that has to work end to end. Everything on this page except the shipped packages is **planned**: designed, not built. There are no dates.

## Shipped

| Package | Contents |
|---|---|
| `@chamvi/core` | `defineAgent()`, trigger definitions, `Engine` (dispatch, scheduling, checkpoints, budgets, approvals, cancel, drain, recovery), effect tools, agent state, the `IStore` and `INotifier` contracts, `MemoryStore` |
| `@chamvi/test-kit` | `describeStoreContract`, `ControllableClock` |
| `@chamvi/scheduler` | `createScheduler()` (one locked hubwire component per `cron()` trigger, overlap policies, timezones), `runJob()` for one-shot jobs |
| `@chamvi/store-typeorm` | `TypeormStore` on Postgres, `migrateStore`, `purgeExpired`. See [TypeORM store](/stores/typeorm) |
| `@chamvi/http` | REST control API, server-sent events, webhook intake, `/healthz`, `/readyz`, `/metrics`, the MCP endpoint, static-token, authup and OIDC authentication, graceful shutdown. See [HTTP API & MCP](/guide/http) |
| `@chamvi/github` | GitHub App auth with an installation-token cache, the signed webhook route, `githubWebhook()` triggers deduplicated by delivery id, read tools and effect write tools with marker reconciliation. See [GitHub App](/deployment/github-app) |
| `@chamvi/sandbox` | Sandbox contracts, path, repository and limit rules, the run-scoped workspace manager with `create_workspace` and `dispose_workspace`. See [Workspaces & Coding](/guide/workspaces) |
| `@chamvi/sandbox-local`, `@chamvi/sandbox-docker`, `@chamvi/sandbox-k8s` | Workspace providers: a temporary directory (development), a hardened container per workspace, a hardened pod per workspace; the `ghcr.io/chamvi/sandbox-node` image |
| `@chamvi/coding` | Coding tools (`read_file`, `write_file`, `edit_file`, `grep`, `list_files`, `bash`, `git_diff`) over a run's workspaces and the `ICodingBackend` contract |
| `@chamvi/ui` | Vue 3 dashboard served by `uiRoutes()`: runs with live steps, an approvals inbox, agent state, schedules |

## Milestones

### M1: issue triage end to end <Badge type="warning" text="Planned" />

On every new issue in the owner's repositories, a triage agent labels it, checks for duplicates, tries to reproduce the bug against the latest release in a sandbox and posts a first reply asking for missing details. A periodic sweep catches issues missed while the agent was down.

M1 is done only when everything it needs ships: the TypeORM store, the scheduler, the HTTP and MCP API with authentication, the GitHub connector, sandboxes with coding tools, the OpenClaw and GitHub notifiers, the UI, the CLI, the base image, the Helm chart (with the sandbox RBAC and an egress NetworkPolicy), the template repository, and the triage agent itself, deployed with Flux.

### M2: mail digest <Badge type="warning" text="Planned" />

Every morning, and on request through OpenClaw, the owner gets a short digest: what matters today, what still needs action, what is waiting on others. Open loops are tracked in typed state collections across days. M2 adds a mail (IMAP) connector and **threaded runs**: a new run continues the conversation of an earlier one.

### M3: dependency upgrade <Badge type="warning" text="Planned" />

When Renovate opens a pull request, an agent reads the changelog of the bumped package, fixes breaking changes in a sandbox, runs the tests and pushes commits. It pings the owner only when it is stuck. M3 adds long coding runs, a Claude Code coding backend and stuck detection.

## Planned packages

| Package | Status | Purpose |
|---|---|---|
| Coding backend on the own tools | Planned (M1) | An `ICodingBackend` that runs the coding tools in a nested tool loop |
| Workspace re-attach | Planned | A run resumed on another replica or after a restart finds its container or pod by label instead of a fresh workspace |
| `@chamvi/coding-claude-code` | Planned (M3) | A coding backend that runs Claude Code inside the sandbox |
| `@chamvi/notify-openclaw` | Planned (M1) | Notifications into OpenClaw chats. See [OpenClaw](/deployment/openclaw) |
| `@chamvi/notify-github` | Planned (M1) | Notifications as issue or pull request comments |
| `chamvi` (CLI and deploy kit) | Planned (M1) | Umbrella package with `createApp()` and the `dev`, `build`, `start`, `run-job` and `migrate` commands, plus a base image, a Helm chart and a template repository. See [Deployment](/deployment/) |
| `@chamvi/mail` | Planned (M2) | IMAP connector and tools |

Two changes happened upstream first: a lock hook, timezone support and the scheduled time per tick shipped in [hubwire](https://github.com/tada5hi/hubwire) 0.2.2 (for the scheduler), and a fetch-native token verification in [authup](https://github.com/authup/authup) 1.0.0-beta.70 (for the HTTP API).

## Stability

chamvi is pre-1.0 and owner-first. Until M3, minor versions may break the API and the store schema.
