# Agent Folders

An app can load agents from a folder while it runs, next to the agents passed to `createApp({ agents })` or instead of them. Each subfolder is one agent; editing, adding or removing a folder reaches the engine, the scheduler, the HTTP routes and MCP on every replica, without a build or a rollout.

```
agents/
  triage/
    agent.ts             # the config: model, budgets, triggers, notify, ...
    instructions.md      # the system prompt
    tools/
      lookup_issue.ts    # the tool lookup_issue
    triggers/
      daily.yaml         # a cron trigger as data
      issues.ts          # a webhook trigger with a key function
    state/
      issues.ts          # the schema of the collection issues
    approvals.yaml       # which tools need an approval
  digest/
    agent.ts
```

Folder code runs in the app's process with the app's full access (store, secrets, provided instances). Only people who may deploy the app should be able to write the folder.

## Turning it on

| Variable | Default | |
|---|---|---|
| `CHAMVI_AGENTS_DIR` | unset (no folder) | The agents dir, relative to the working directory or absolute |
| `CHAMVI_AGENTS_POLL_MS` | `5000` (`DEFAULT_AGENTS_POLL_MS`) | How often the dir is checked for changes, 1 to `TIMER_MAX_MS` |

With `CHAMVI_AGENTS_DIR` set, `createApp()` may get no `agents` at all; without it, an app without agents fails to start (`createApp needs at least one agent or CHAMVI_AGENTS_DIR.`, exit 2). A value that names no directory fails `start` and `run-job` the same way. `chamvi migrate` ignores the folder.

The built-in module `chamvi:agents` (`agentsModule()`) does the work: `start` and `run-job` load every folder before the engine starts, so the first queued run already finds its agent, and `start` then watches the dir until the app stops. `run-job` loads once and does not watch, so `chamvi run-job <agent>` works for a folder agent too.

Keep the agents dir inside the app's directory (for example `/app/agents` next to `/app/node_modules`): imports resolve like Node resolves them, from the importing file upwards, so a folder outside the app cannot import `@chamvi/app`, `@chamvi/core` or any other installed package.

## The layout

The folder name is the agent name (`^[a-z0-9]+(-[a-z0-9]+)*$`, at most 64 characters). Every file but `agent.*` is optional.

| File | Holds |
|---|---|
| `agent.{ts,mts,js,mjs}` | Default export: the agent's config, `defineAgent()`'s input without `name` (`AgentConfig`). It carries what has no file of its own: `model`, `budget`, `output`, `toolPolicy`, `notify`, `toolsContext`, and may hold `tools`, `triggers`, `state` and `approvals` too |
| `instructions.md` | The system prompt, read as is. Setting `instructions` in `agent.ts` as well is an error, and so is setting them nowhere |
| `tools/<tool>.{ts,mts,js,mjs}` | Default export: an AI SDK `Tool` or a `(ctx: ToolContext) => Tool` factory. The file name is the tool name (`^[A-Za-z0-9_-]{1,64}$`) |
| `triggers/<file>.{ts,mts,js,mjs}` | Default export: a `TriggerDefinition` (`cron()`, `http()`, `webhook()`, `githubWebhook()`) |
| `triggers/<file>.{yaml,yml,json}` | A trigger as data (see below) |
| `state/<collection>.{ts,mts,js,mjs}` | Default export: the Standard Schema of the collection |
| `approvals.{ts,mts,js,mjs,yaml,yml,json}` | `{ <tool>: 'user' }`; a module file may also give a policy function |

What the files add is merged with the same key of `agent.ts`, and a name in both is an error: a tool of `tools/` and of the config's `tools`, a collection, an approval. Triggers add up. A trigger keeps its own id whatever the file is called (`cron:<expression>`, `http`, `webhook:<path>`), and ids must stay unique, as for every agent, so two files with the same cron expression are an error. When a tool file exports a factory, or the config's `tools` is one, the merged set is a factory too; a clash with a config factory's tools then fails the run's execution instead of the load.

Entries whose name starts with `.` or `_` are skipped: a `_shared.ts` helper next to the tools is no tool, and an `_archive/` folder in the agents dir is no agent.

<<< @/snippets/agent-folder/agent.ts#agent

`AgentConfig` requires `instructions`, so an `agent.ts` that leaves them to `instructions.md` checks against `Omit<AgentConfig, 'instructions'>`; one that sets them uses `satisfies AgentConfig`.

<<< @/snippets/agent-folder/tools/lookup_issue.ts#tool

<<< @/snippets/agent-folder/state/issues.ts#state

### Triggers

A module file exports any trigger, with key functions or a payload schema:

<<< @/snippets/agent-folder/triggers/issues.ts#trigger

A data file holds exactly one of three forms; any other key is an error:

```yaml
# triggers/daily.yaml: cron(expression, { timezone, overlap, payload })
cron: '0 9 * * 1-5'
timezone: Europe/Berlin   # optional
overlap: queue-one        # optional: skip (default), queue-one, allow
payload: { kind: daily }  # optional
```

```yaml
# triggers/http.yaml: http(), the REST, dashboard and MCP start
http: true
```

```yaml
# triggers/hook.yaml: webhook({ path })
webhook: /issues
```

A trigger that needs a function (an `idempotencyKey`, a `concurrencyKey`, a payload `schema`, a GitHub `filter`) is a module file.

### Approvals

```yaml
# approvals.yaml
github_close_issue: user
```

A data file allows only `'user'`; an `approvals.ts` may map a tool to a policy function (see [Approvals](/guide/approvals)).

## Imports

Folder files may import their own files (relative imports, also outside `tools/`) and packages installed in the app. Module files are TypeScript or JavaScript, loaded through jiti without a module cache, so a reload also sees an edited helper file; packages from `node_modules` load natively, as the same instance the app uses. That matters: a second copy of `@chamvi/core` would break context keys (`defineContextKey()` refuses a key of another copy), `instanceof` checks of chamvi errors and the tool context marker. So an agent folder never has a `node_modules` or dependencies of its own; a package it needs is installed in the app.

## Load errors

A folder that does not load never stops the app. A syntax error, a missing default export, a schema the data form refuses, a duplicate tool, a model string whose provider is not installed: the agent is reported as failed to load, with a message naming the file relative to the agents dir.

- The log gets `agent load failed` with the agent and the message.
- `GET /agents` lists it in `issues: [{ agent, message, at }]` next to `data`, and the [dashboard](/guide/ui)'s agents page shows a notice.
- An agent that loaded before stays loaded with its previous code until the folder is valid again, and its runs go on. A broken folder is tried once per content: the next attempt comes with the next change.

## Live reload

Each poll hashes every folder (sha256 over every file below it, dot-entries skipped). A changed folder loads once two polls in a row see the same hash, so a change lands within two intervals and a tree that is still being copied is not loaded half-way. A folder missing on two polls in a row is removed. When the agents dir itself is gone (an unmounted volume), every agent stays loaded until it is back.

To replace a folder at once, write the new tree next to it under a dot-prefixed name (skipped by the loader) and rename it over the old one.

### Replacing an agent cancels its runs

A new version of an agent's code cancels the agent's unsettled runs (`queued`, `running`, `waiting`, `interrupted`) created before the change, then the new code takes over. Settled runs and their steps stay readable, also after the agent was removed. Plan changes with that in mind: an agent whose runs wait on approvals loses them on every edit.

- **Once across replicas.** The store keeps one revision marker per folder agent (`{ agent, hash, changedAt }`, no code). The first replica that loads a new hash takes the store lock `agents:<name>`, cancels, and writes the marker; the others find the marker at their hash and only swap the code.
- **First sight cancels nothing**: a folder added to the dir has no marker yet.
- **While the app was down**: a folder changed while every replica was stopped cancels once at the next boot; a normal boot cancels nothing. A marker whose folder is gone at boot removes that agent.
- **Removal** cancels every unsettled run of the agent and deletes its marker.

## Several replicas

Every replica must see the same folder: mount one ReadWriteMany volume (NFS, CephFS, EFS) into each, or bake the folder into the image or a ConfigMap (read-only is fine; chamvi never writes it). Each replica polls on its own, since inotify does not cross NFS, and nothing is relayed through the store, so replicas agree within about two poll intervals.

During that window the store keeps them apart: a replica starts (and recovers) a run of a folder agent only while its loaded hash equals the stored marker, and a run of an agent it has not loaded at all (not seen yet, failed to load) stays `queued` for a replica that has it, instead of failing. A run created under the new hash is never cancelled by a replica that lags behind, since the cancel covers only runs created before the marker changed and happens once.

## Code agents win

A folder named like an agent passed to `createApp({ agents })` is not loaded: it is reported as an issue (`a code agent has this name; the folder is not loaded.`), and the code agent stays as it is.

## Without the app

The loader is part of `@chamvi/app`'s main entry, for tests and tools:

```ts
function loadAgent(dir: string, options?: LoadAgentOptions): Promise<LoadedAgent>; // throws InvalidAgentDefinitionError
function loadAgents(root: string, options?: LoadAgentOptions): Promise<LoadAgentsResult>; // never throws for a folder
function listAgentFolders(root: string): Promise<string[]>;
function hashAgentFolder(dir: string): Promise<string>;
```

Registering an agent at runtime is the engine's: `engine.putAgent(agent, { revision? })` and `engine.removeAgent(name)` (see the [core reference](/reference/#engine)).
