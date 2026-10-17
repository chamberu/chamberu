# GitHub App <Badge type="warning" text="Planned" />

::: warning Planned
`@chamberu/github` is planned. Names and options may change.
:::

## One App per agent repository

Each agent repository (and so each image) gets its own GitHub App, with its own webhook URL, App credentials and Secret. There is no shared intake router: an App's webhooks go straight to the app that owns it.

The App needs the permissions its tools use (for triage: issues read and write, metadata read, contents read) and subscribes to the events its triggers name.

## Webhooks

The planned connector mounts `POST /webhooks/github` into the HTTP app and:

1. verifies `X-Hub-Signature-256` against the raw body and rejects anything else with `401`,
2. matches the event and action (`issues.opened`, `pull_request.synchronize`, ...) against the agents' `github.webhook()` triggers,
3. ignores events sent by the App itself, so the agent does not trigger itself,
4. dispatches with the delivery id (`X-GitHub-Delivery`) as the idempotency key and, by default, `<owner>/<repo>#<number>` as the concurrency key,
5. answers `202` right away; the run happens asynchronously.

## Tools

Installation tokens are short-lived, cached per installation until they expire and never logged. Read tools cover issues, labels, search, pull requests, files and releases. Write tools are [effect tools](/guide/effect-tools):

- adding labels is naturally idempotent,
- comments embed an [`effectMarker`](/guide/effect-tools#the-crash-window) and `alreadyApplied` searches for it before posting, so a crash between posting and recording does not post twice,
- closing an issue is meant to sit behind an [approval](/guide/approvals).

Sandboxes never get the App's credentials. When a tool must push, the connector creates a short-lived token scoped to one repository.

## What works today

You can already write GitHub tools as effect tools with your own Octokit client and dispatch runs from your own webhook handler, using the delivery id as `idempotencyKey`. The [effect tools](/guide/effect-tools) page shows the comment pattern.
