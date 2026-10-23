# Agent Folders

An app can load agents from a folder while it runs, next to the agents passed to `createApp({ agents })` or instead of them. Each subfolder is one agent; editing, adding or removing a folder reaches the engine, the cron channel, the HTTP routes and MCP on every replica, without a build or a rollout.

```
agents/
  triage/
    agent.ts             # the one required file: export default defineAgent({ name: 'triage', ... })
    prompt.md            # yours: agent.ts reads it
    tools/
      lookup-issue.ts    # yours: agent.ts imports it
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

The built-in module `chamvi:agents` (`agentsModule()`) does the work: `start` and `run-job` load every folder before the engine starts, so the first queued run already finds its agent, and `start` then watches the dir until the app stops. `run-job` loads once and does not watch, so `chamvi run-job <agent>` works for a folder agent too; it never removes an agent whose folder it does not see (only `start` does), so a job pod without the agents volume cannot cancel the replicas' runs.

The agents dir may live anywhere, also outside the app (a volume at `/data/agents`): `@chamvi/*`, `ai` and `@ai-sdk/*` always resolve to the copies the app itself uses, wherever the importing file is. Other packages resolve like Node resolves them, from the importing file upwards, so keep the dir inside the app's directory (for example `/app/agents` next to `/app/node_modules`) when folder code imports them.

## The folder

An agent folder holds an `agent.ts`, and chamvi enforces nothing else. The folder name is the agent name (`^[a-z0-9]+(-[a-z0-9]+)*$`, at most 64 characters). `agent.ts` default-exports `defineAgent({ name, ... })`'s result, whose `name` must equal the folder name (anything else is an error); a folder without `agent.ts` is reported as an issue (`<name>: has no agent.ts.`).

Everything else in the folder is the agent's own: `agent.ts` loads its tools, instructions, subscriptions and helpers with plain imports or file reads, organised however you like. `prompt.md` and `tools/` in the tree above are an example, not a convention.

<<< @/snippets/agent-folder/agent.ts#agent

<<< @/snippets/agent-folder/tools/lookup-issue.ts#tool

Folders in the agents dir whose name starts with `.` or `_` are skipped, so an `_archive/` folder is no agent (a `node_modules` folder is never an agent either, and refused, see [Imports](#imports)).

## Imports

`agent.ts` may import its own files (relative imports, any depth) and packages installed in the app. jiti transpiles `agent.ts` and every `.ts` or `.mts` file it imports on every load, without a module cache, so a reload sees every edit; a file `agent.ts` reads itself (`readFileSync(new URL('./prompt.md', import.meta.url), 'utf8')`) is read again on every load too, and JSON imports are read fresh. Helpers must be TypeScript: Node caches a natively imported `.js`, `.mjs` or `.cjs` file for the life of the process, so a JavaScript file anywhere in the folder is a load error (`a JavaScript file is not reloaded fresh; write helpers as .ts or .mts.`).

Packages load natively, as the same instance the app uses, and `@chamvi/*`, `ai` and `@ai-sdk/*` resolve to the app's copies. That matters: a second copy of `@chamvi/core` would break context keys (`defineContextKey()` refuses a key of another copy), `instanceof` checks of chamvi errors and the tool context marker. So an agent folder and the agents dir never have a `node_modules` folder (a load error); a package folder code needs is installed in the app.

## Load errors

A folder that does not load never stops the app. A missing `agent.ts`, a syntax error, a missing default export, a definition `defineAgent()` refuses (a duplicate subscription id), a model string whose provider is not installed, a subscription naming no registered channel, a cron subscription the cron channel cannot schedule (a timezone or an expression it refuses), a `run_<agent>` MCP tool that cannot be built (an agent name above 60 characters with an `http.on()` subscription, a payload schema MCP cannot compile): the agent is reported as failed to load, with a message naming the file relative to the agents dir. Each module checks a folder agent before it is registered (the `AGENT_CHECKS` contributions), so a refused agent writes no marker and cancels nothing.

- The log gets `agent load failed` with the agent and the message.
- `GET /agents` lists it in `issues: [{ agent, message, at }]` next to `data`, and the [dashboard](/guide/ui)'s agents page shows a notice.
- An agent that loaded before stays loaded with its previous code until the folder is valid again, and its runs go on. A broken folder is tried once per content: the next attempt comes with the next change.

## Live reload

Each poll hashes every folder (sha256 over every file below it, dot-entries skipped), so a change to any file of the folder, also one `agent.ts` only reads, reloads the agent. A changed folder loads once two polls in a row see the same hash, so a change lands within two intervals and a tree that is still being copied is not loaded half-way: the load hashes the folder again before and after it reads it, and registers the agent only when both equal the stable hash (otherwise the next stable poll decides). A folder missing on two polls in a row is removed. When the agents dir itself is gone, or has no entry at all (the empty mount point of a volume that is not mounted), every agent stays loaded and nothing is removed until it is back; the boot removes no agent for such a dir either. To remove the last folder agent on purpose, leave any file in the dir (a `.keep`), so its empty listing counts.

To replace a folder at once, write the new tree next to it under a dot-prefixed name (skipped by the loader) and rename it over the old one.

### Replacing an agent cancels its runs

A new version of an agent's code cancels the agent's unsettled runs (`queued`, `running`, `waiting`, `interrupted`) created before the change, then the new code takes over. Settled runs and their steps stay readable, also after the agent was removed. Plan changes with that in mind: an agent whose runs wait on approvals loses them on every edit.

- **Once across replicas.** The store keeps one revision marker per folder agent (`{ agent, hash, changedAt }`, no code). The first replica that loads a new hash takes the store lock `agents:<name>`, cancels, and writes the marker; the others find the marker at their hash and only swap the code.
- **First sight cancels nothing**: a folder added to the dir has no marker yet.
- **While the app was down**: a folder changed while every replica was stopped cancels once at the next boot; a normal boot cancels nothing. A marker whose folder is gone at boot removes that agent.
- **Removal** cancels every unsettled run of the agent and deletes its marker; a replica that removes it later cancels the runs it created meanwhile. A replica that still has an older version leaves a newer marker (and its runs) alone.

## Several replicas

Every process sharing the store (replicas, `run-job` pods, a canary) must see byte-identical folders: mount one ReadWriteMany volume (NFS, CephFS, EFS) into each, or a ConfigMap (read-only is fine; chamvi never writes it). Baking the folder into the image works only while every process runs the same image: during a rolling deploy two images register two hashes, the last one to load moves the marker, and the other replicas stop running that agent until they are replaced. Each replica polls on its own, since inotify does not cross NFS, and nothing is relayed through the store, so replicas agree within about two poll intervals.

A replica whose folder did not change but whose marker another process moved or removed runs nothing of that agent and reports it as an issue (`another process sharing the store registered other content for this agent; ...`, logged as `agent revision moved`); it does not move the marker back, since two processes with different folders would cancel each other's runs. The issue clears once the folder and the marker match again.

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
