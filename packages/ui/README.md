<p align="center">
    <img src="https://raw.githubusercontent.com/chamvi/chamvi/master/.github/assets/logo.svg" alt="@chamvi/ui" width="128" height="128" />
</p>

<h1 align="center">@chamvi/ui</h1>

<p align="center">
    <b>The chamvi dashboard.</b><br>
    Watch runs live, answer approvals, look into agent state and schedules,<br>
    served by your own <code>@chamvi/http</code> app on the same origin.
</p>

<p align="center">
    <a href="https://www.npmjs.com/package/@chamvi/ui"><img src="https://img.shields.io/npm/v/@chamvi/ui" alt="npm version" /></a>
    <a href="https://github.com/chamvi/chamvi/actions/workflows/ci.yml"><img src="https://github.com/chamvi/chamvi/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="https://github.com/chamvi/chamvi/blob/master/packages/ui/LICENSE"><img src="https://img.shields.io/npm/l/@chamvi/ui" alt="License" /></a>
</p>

---

**Table of Contents**
- [Installation](#installation)
- [Usage](#usage)
- [Views](#views)
- [Sign-in](#sign-in)
- [Options](#options)
- [Serving](#serving)
- [API](#api)
- [License](#license)

## Installation

```bash
npm install @chamvi/ui @chamvi/http @chamvi/core --save
```

ESM only, Node.js `>=22`. `@chamvi/core` and `@chamvi/http` are peer dependencies. The package ships a prebuilt Vue 3 app (`dist/app`); nothing of it runs on the server but a static file route.

## Usage

`uiRoutes()` returns extra routes for `createHttpApp({ routes })`:

```typescript
import { Engine, MemoryStore } from '@chamvi/core';
import { createHttpApp, staticTokens } from '@chamvi/http';
import { uiRoutes } from '@chamvi/ui';

const engine = new Engine({
    store: new MemoryStore(),
    agents: [],
    resumeSecret: process.env.RESUME_SECRET ?? 'change-me',
});

const admin = {
    value: process.env.ADMIN_TOKEN ?? 'admin-token-0123456789',
    id: 'admin',
    permissions: ['*'],
};

export const app = createHttpApp({
    engine,
    auth: [staticTokens({ tokens: [admin] })],
    // the dashboard at /ui: runs, approvals, agent state and schedules
    routes: uiRoutes(),
});
```

Open `http://<host>/ui/` and sign in with a bearer token of the app.

## Views

| View | Shows | Needs |
|---|---|---|
| Runs | Every run, newest first, filtered by agent and status, with status, steps and tokens; refreshes every 5 s | `run:read` |
| Run | Header with budgets, the trigger envelope and the step timeline (llm, tool, wait), live over SSE with streamed text; cancel | `run:read` or `agent:<name>:run`; `run:cancel` to cancel |
| Approvals | Waiting runs with the tool and its input; Approve or Deny with a reason | `run:read` to list, `agent:<name>:approve` to answer |
| Agent state | Key-value entries and collections, read-only | `state:read` |
| Schedules | Cron triggers per agent with the next fire time | `run:read` |

A notifier's deep link `/ui/approvals?token=<resume token>` opens the approval of that token. The SPA moves the token out of the address bar before anything renders (into `sessionStorage`, gone on sign-out) and answers it through `POST /resume`, so it works with only `agent:<name>:approve`.

## Sign-in

- **Token** (default): paste a static bearer token (`staticTokens()` of `@chamvi/http`). `GET /me` checks it before it is kept, in `sessionStorage` of the tab only.
- **authup**: `uiRoutes({ auth: { authup: { url, clientId, realmId? } } })` adds "Continue with authup" (OIDC code flow with PKCE). The authup client needs `<origin><uiBase>/login/callback` as a redirect URI, e.g. `https://chamvi.example.com/ui/login/callback`. Pair it with the app's `authup()` authenticator. `auth: { tokens: false }` hides the token form.

An expired or revoked credential answers 401: the dashboard refreshes an authup session once, else returns to sign-in and back to the page it was on.

## Options

| Option | Default | Purpose |
|---|---|---|
| `basePath` | `'/ui'` | The dashboard's path under the app's `basePath`, lower case (`/api` + `/console` serves `/api/console/`) |
| `auth.tokens` | `true` | Offer the token form |
| `auth.authup` | none | `{ url, clientId, realmId? }` of an authup server |
| `root` | the package's `dist/app` | Another build folder |

Invalid options throw `InvalidAgentDefinitionError` of `@chamvi/core`. A missing build is reported on the first request (500, `onError`), not at construction, so the build may arrive later.

## Serving

- Every `GET` below `basePath`: a file of the build, else `index.html` for a path without an extension (client routes), else 404. `index.html` gets `<base href="<uiBase>/">` and the config as a JSON block.
- Hashed files under `assets/` are `cache-control: public, max-age=31536000, immutable`, everything else `no-cache`.
- Paths are decoded once and refused on `..`, `.`, empty segments, backslashes, NUL and double encoding: nothing outside the build is ever read.
- Every answer carries `Content-Security-Policy` (`default-src 'self'`, scripts only from the app, `connect-src` and `form-action` add the authup origin, `frame-ancestors 'none'`), `referrer-policy: no-referrer` (a deep link's token never leaves as a referrer), `x-content-type-options: nosniff` and `x-frame-options: DENY`.
- The route is unauthenticated (the app holds no secret; every API call carries the signed-in bearer token) and skips the rate limiter.

Behind a proxy that mounts the app under a prefix, set the app's `basePath`; the dashboard follows it.

## API

| Export | Kind | Purpose |
|---|---|---|
| `uiRoutes` | function | The dashboard route for `createHttpApp({ routes })` |
| `DEFAULT_UI_BASE_PATH` | constant | `'/ui'` |
| `ASSET_CACHE_CONTROL` | constant | `'public, max-age=31536000, immutable'` |
| `DOCUMENT_CACHE_CONTROL` | constant | `'no-cache'` |
| `CONFIG_ELEMENT_ID` | constant | `'chamvi-config'`, the id of the injected config block |

Types: `UiRoutesOptions`, `UiConfig`, `UiAuthupConfig`.

## License

Published under [Apache License 2.0](./LICENSE).
