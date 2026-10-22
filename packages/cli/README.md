<p align="center">
    <img src="https://raw.githubusercontent.com/chamvi/chamvi/master/.github/assets/logo.svg" alt="@chamvi/cli" width="128" height="128" />
</p>

<h1 align="center">@chamvi/cli</h1>

<p align="center">
    <b>The chamvi command line: dev, build, start, run-job and migrate for an app built with <a href="https://www.npmjs.com/package/@chamvi/app">@chamvi/app</a>.</b>
</p>

<p align="center">
    <a href="https://www.npmjs.com/package/@chamvi/cli"><img src="https://img.shields.io/npm/v/@chamvi/cli" alt="npm version" /></a>
    <a href="https://github.com/chamvi/chamvi/actions/workflows/ci.yml"><img src="https://github.com/chamvi/chamvi/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="https://github.com/chamvi/chamvi/blob/master/packages/cli/LICENSE"><img src="https://img.shields.io/npm/l/@chamvi/cli" alt="License" /></a>
</p>

---

## Installation

```bash
npm install @chamvi/app @chamvi/cli ai
npm install --save-dev tsdown   # only for chamvi build
```

## Usage

An app is one entry, `src/index.ts`, whose default export is `createApp()` from [@chamvi/app](https://www.npmjs.com/package/@chamvi/app):

```ts
import { createApp } from '@chamvi/app';
import { echo } from './agents.ts';

export default createApp({ agents: [echo] });
```

`package.json` scripts:

```json
{
    "type": "module",
    "scripts": {
        "dev": "chamvi dev",
        "build": "chamvi build",
        "start": "chamvi start"
    }
}
```

Relative imports carry `.ts` and there is no `enum`, so `chamvi dev` (Node's type stripping) and `chamvi build` (tsdown) accept the same code. The template `tsconfig.json`:

```json
{
    "extends": "@tada5hi/tsconfig",
    "compilerOptions": {
        "allowImportingTsExtensions": true,
        "erasableSyntaxOnly": true,
        "noEmit": true
    }
}
```

## Commands

`chamvi <command> [args] [flags]`, plus `--help` and `--version`. Every command takes `--entry <path>`.

| Command | Arguments and flags | Does |
|---------|---------------------|------|
| `dev` | `--entry` | Runs `node --watch --env-file-if-exists=.env <cli> start --dev --entry <source entry>`: restarts on a change of the entry, its imports or `.env` (Node watches the env file itself, so no `--watch-path` is needed) |
| `build` | `--entry`, `--out-dir <dir>` (default `dist`) | Bundles the entry with tsdown into `<out-dir>/index.mjs` plus its source map: ESM, `node22`, every `dependencies` and `peerDependencies` package external, the app's own modules inlined. The out dir is emptied first, so one that is the project folder or above it, holds the entry, or holds anything but `.mjs` and `.mjs.map` files exits 2 |
| `start` | `--entry` | Starts the app: store (and migrations), engine, scheduler, then HTTP |
| `run-job` | `<agent>`, `[triggerId]`, `--entry` | Fires one cron trigger once and waits for its run (a Kubernetes CronJob); `triggerId` defaults to the agent's only cron trigger |
| `migrate` | `--entry` | Migrates the Postgres store (`DATABASE_URL` required) |

The entry is `--entry`, else for the source commands (`dev`, `build`) the `package.json` field `"chamvi": { "entry": "<path>" }`, else `src/index.ts`. The built commands (`start`, `run-job`, `migrate`) never read that field and default to `dist/index.mjs`, so an image built from a repository that sets it still starts; a `.ts` entry runs through type stripping too.

`chamvi dev` runs `start --dev`: the source entry, `.env` from the working directory (never overriding a set variable), a `MemoryStore` unless `DATABASE_URL` is set, a random `RESUME_SECRET` and, without another authenticator, one random `*` token, each logged with a warning, and shorter timeouts (`CHAMVI_DRAIN_TIMEOUT_MS` 5000, `CHAMVI_FORCE_EXIT_MS` 15000).

## Exit codes

| Code | When |
|------|------|
| `0` | Success: a clean stop, a built bundle, a migrated store; `run-job` for a completed, waiting, skipped, queued-behind-an-approval or signal-interrupted run |
| `1` | Runtime failure: a start, build or migrate error, a failed or cancelled job, a forced exit |
| `2` | Usage or configuration: an unknown command or flag, an entry that is missing or no chamvi app, missing or invalid env (named, its value never echoed), a model string whose provider package or API key is missing |

The CLI sets `process.exitCode` and lets Node exit; it calls `process.exit()` only for a forced exit.

## Signals

`start` and `run-job`:

- The first SIGTERM or SIGINT stops the app (`/readyz` 503, scheduler stop, HTTP close, engine drain up to `CHAMVI_DRAIN_TIMEOUT_MS`, store close), then exits 0, or 1 when the stop reported an error.
- A second signal exits 1 at once. A signal within 1 s of the first counts as the same one, since `npm run dev` and `npm start` deliver one Ctrl-C twice (npm forwards SIGINT to the script while the terminal signals the whole group).
- `CHAMVI_FORCE_EXIT_MS` (default 90000) after the first signal, a stop still running exits 1.

`migrate` installs no handlers: Node's default ends it.

On Kubernetes keep `preStop + CHAMVI_FORCE_EXIT_MS < terminationGracePeriodSeconds`. With a 5 s `preStop` sleep and a grace period of 120 s the worst case is 5 + 30 (drain) + 5 (close) + 30 (workspaces) = 70 s, the forced exit comes at 95 s and SIGKILL at 120 s.

`chamvi dev` runs its child in a process group of its own, so a terminal Ctrl-C reaches only the CLI, which forwards that one signal (the app then stops once, instead of getting the terminal's SIGINT plus the one `node --watch` forwards). SIGHUP (the terminal closed) and the CLI's own exit stop the child with SIGTERM, and the child's stdin is a pipe only the CLI writes: when the CLI dies without its exit hook (SIGKILL, the OOM killer), the pipe closes and the app ends the whole group, so it never outlives the CLI. The exit code is the child's, 0 when it ended by a forwarded signal.

## License

Published under [Apache License 2.0](./LICENSE).
