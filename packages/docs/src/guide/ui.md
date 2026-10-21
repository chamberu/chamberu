# Dashboard

`@chamvi/ui` is a dashboard for the runs of an app: watch them live, answer approvals, look into agent state and see when cron triggers fire next. It is a prebuilt Vue 3 app (vuecs, the Crimson design) that your own `@chamvi/http` app serves on the same origin, so there is no CORS and no second deployment.

```bash
npm install @chamvi/ui --save
```

`uiRoutes()` returns the extra routes for `createHttpApp({ routes })`:

<<< @/snippets/ui.ts#tokens

Open `/ui/` and paste a token. Nothing of the dashboard runs on the server but one static file route; every page talks to the API it already has, with the signed-in principal's bearer token.

## Pages

| Page | Shows | Needs |
|---|---|---|
| Runs | Every run, newest first (`GET /runs?sort=-createdAt`), filtered by agent and status in the address bar; counts of running, waiting and failed runs; tokens per run. Refreshes every 5 s. | `run:read` |
| Run | Status, budgets (steps, tokens, time), the trigger envelope and the step timeline (llm, tool and wait steps, inputs and outputs collapsed). Live over the run's SSE stream, including the streamed text of the step in progress. A cancel button with a confirmation. | `run:read` or `agent:<name>:run`; `run:cancel` to cancel |
| Approvals | Each waiting run with the tool, its input, the expiry countdown and a reason field; Approve or Deny (`POST /runs/:id/approve`). The sidebar shows the count. | `run:read` to list, `agent:<name>:approve` to answer |
| Agent state | Key-value entries and the declared collections, read-only. | `state:read` (and `run:read` for the agent list) |
| Schedules | The `cron()` triggers per agent with the next fire time in the trigger's time zone. | `run:read` |

A principal without the grant a page needs sees a notice naming it; the rest of the dashboard keeps working. An approval link from a notification works with `agent:<name>:approve` alone.

## Sign-in

- **Token** (default): a static bearer token of `staticTokens()`. `GET /me` checks it before it is kept, in the tab's `sessionStorage` only; sign-out removes every `chamvi.` key.
- **authup**: `auth.authup` adds "Continue with authup", the OIDC code flow with PKCE through `@authup/client-web-kit`. The authup client needs `<origin><uiBase>/login/callback` as a redirect URI. Pair it with the app's `authup()` authenticator. `auth.tokens: false` hides the token form (then `auth.authup` is required).

<<< @/snippets/ui.ts#authup

A revoked token or an expired authup session answers 401: the dashboard refreshes the authup session once, else signs out and returns to the sign-in page with the page it was on as the way back.

## Approval links

A notifier can link a person straight to an approval: `<origin><uiBase>/approvals?token=<resume token>`. Before anything renders, the dashboard moves the token out of the address bar into `sessionStorage` (so the history, a sign-in redirect and the `Referer` never carry it; every answer is also sent with `referrer-policy: no-referrer`), survives the sign-in round-trip, and answers through `POST /resume` with that token. An expired or already used token reads as "already answered". The inbox itself never sees a resume token: it answers by approval id, and a run that moved on to another approval answers 409.

## Serving

| Option | Default | |
|---|---|---|
| `basePath` | `'/ui'` | The dashboard's path under the app's `basePath`, lower case |
| `auth.tokens` | `true` | Offer the token form |
| `auth.authup` | none | `{ url, clientId, realmId? }` |
| `root` | the package's `dist/app` | Another build folder |

- Every `GET` below `basePath` answers a file of the build, `index.html` for any other path without an extension (the client routes), or 404. Hashed files under `assets/` are cached for a year (`immutable`), the rest `no-cache`.
- `index.html` gets `<base href="<uiBase>/">` and the config (`apiBase`, `uiBase`, the sign-in modes) as a JSON block, so the same build works under any `basePath`.
- Paths are decoded once and refused on `..`, `.`, empty segments, backslashes, NUL and double encoding: nothing outside the build is read.
- Every answer carries a Content-Security-Policy (`default-src 'self'`, scripts only from the build, `connect-src` and `form-action` add the authup origin, `frame-ancestors 'none'`), `x-content-type-options: nosniff`, `x-frame-options: DENY` and `referrer-policy: no-referrer`. Fonts and icons are part of the build; nothing loads from a CDN.
- The route checks no credentials (the build holds no secret) and skips the rate limiter.

Behind a proxy that mounts the app under a prefix, set the app's `basePath`; the dashboard follows it. Invalid options throw `InvalidAgentDefinitionError`; a missing build is reported on the first request (500 and `onError`), so the build may land later, e.g. in a container image.

## Live updates

The runs list and the inbox poll every 5 s. The run page follows `GET /runs/:id/stream` with a fetch-based reader (an `EventSource` cannot send the bearer header): after a dropped connection it reconnects with the last step index as `Last-Event-ID` (1, 2, 5, then every 10 s, or the `Retry-After` of a 503 from the stream cap), so a step is never lost or shown twice. Streamed text belongs to the model step in progress and gives way to the step once it is stored.
