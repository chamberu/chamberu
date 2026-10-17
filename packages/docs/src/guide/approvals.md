# Approvals & Resume Tokens

A tool call can wait for a human. The run pauses in `waiting`, the owner gets a notification with a signed resume token, and `engine.resume(token, decision)` continues the run, minutes or days later, on any replica.

## Declaring approvals

`approvals` maps tool names to a policy. `'user'` always asks. A function decides per call and returns `'user'` (ask), `'allow'` (run without asking) or `'deny'` (refuse without asking). It receives the tool input and `{ runtimeContext }`, the run context.

<<< @/snippets/approvals.ts#agent

The engine translates the policies into the AI SDK's `toolApproval` and signs the approval requests with `resumeSecret`.

## The pause

When a step asks for an approval:

1. The first unanswered approval request becomes the run's **wait point** (`run.waiting`): `approvalId`, `toolName`, `input`, `expiresAt` and a `tokenId`.
2. The run moves `running` to `waiting` and releases its claim and its slot. A run with a concurrency key keeps the key blocked while it waits.
3. The agent's notifier (`notify`) gets one `approval` notification with the resume token. A successful send records `waiting.notifiedAt`.

One approval per pause: when one step asks for several approvals, the run waits on the first and the other calls are dropped from the history. The model asks for them again after the resume if it still needs them.

<<< @/snippets/approvals.ts#engine

The engine throws `InvalidAgentDefinitionError` for an empty `resumeSecret` (anyone could mint tokens with it) and for a `notify` that names no registered notifier.

## Resuming

<<< @/snippets/approvals.ts#resume

`resume()` verifies the token against the run's current wait point, moves the run `waiting` to `queued`, appends the `tool-approval-response` to the checkpoint and a `wait` step, and clears the wait point. The next execution runs the approved call, or tells the model it was denied (with your `reason`).

- A token answers its wait point once. A second `resume()` throws `InvalidRunStateError`.
- A forged, malformed, expired or superseded token throws `InvalidResumeTokenError`.
- If writing the answer fails, the run goes back to `waiting` and the token stays valid.

## Timeouts

An approval not answered within `approvalTimeoutMs` (default 24 hours) is denied with the reason `approval timed out`. The engine checks on every poll (`tick()`). The model sees the denial and can react.

## Notification retries

A failed send is retried on every poll until it succeeds. A store lock per approval keeps replicas from sending at the same time, and the notifier receives a stable `idempotencyKey` (`<runId>:<approvalId>`) to drop a duplicate whose delivery record was lost. See [Notifiers](/guide/notifiers).

## Token format

```
base64url(JSON { runId, approvalId, tokenId, exp }) + "." + base64url(HMAC-SHA256(resumeSecret, payload))
```

The signature is compared in constant time, and a token expires at the wait point's `expiresAt`. `createResumeToken(secret, claims)` and `verifyResumeToken(secret, token, now)` are exported for transports that carry tokens themselves.

::: tip Where tokens are answered
In core you call `engine.resume()` yourself. The planned [`@chamberu/http`](/roadmap#planned-packages) package adds an authenticated resume endpoint and an MCP `resume_run` tool, and the planned UI an approvals inbox.
:::
