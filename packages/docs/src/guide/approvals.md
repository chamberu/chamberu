# Approvals & Hooks

A tool call can wait for a human. The tool calls `approve()`, the run pauses in `waiting` and frees its slot, and once the owner answers (minutes or days later, on any replica, after any number of restarts) the call runs again and `approve()` returns the decision. Agent hooks put the same gate in front of tools you did not write.

## Asking from a tool

<<< @/snippets/approvals.ts#tool

`approve(ctx, { title, body?, timeoutMs? })` resolves `{ approved, reason?, approver? }`. It works only inside a tool call (its `execute`, or an agent hook); anywhere else it throws `InvalidRunStateError`. `timeoutMs` defaults to 24 hours (`DEFAULT_APPROVAL_TIMEOUT_MS`) and may not exceed `2^31 - 1` ms.

How it survives a restart:

1. The first time, `approve()` has no decision for this call. It records the request and suspends the call; nothing is sent yet.
2. The step ends. The engine saves the checkpoint with the suspended call **pending** (the assistant message keeps every tool call, the tool message keeps the results of the calls that finished), stores the **wait point** (`run.waiting`: `approvalId`, `toolName`, `toolCallId`, `title`, `body?`, `channel?`, `address?`, `expiresAt`, `tokenId`) and moves the run `running` to `waiting`, releasing its claim and slot. A run with a concurrency key keeps the key blocked while it waits.
3. An answer records the decision, appends a `wait` step and moves the run to `queued`.
4. The next execution first runs the pending calls (no model call): the tool starts again from the top, and this time `approve()` returns the recorded decision. Their results join the checkpoint, then the model loop goes on and the model sees the tool's result.

The approval id is `<stepIndex>:<toolCallId>:<n>`: the checkpoint index of the model step that made the call (so a provider that reuses a call id in a later step is asked again), the call id, and `n` counting the `approve()` calls of one tool call, so a tool may ask twice (the second question pauses again after the first was answered).

::: warning Code before approve() runs again
On resume the tool runs from the start. Whatever it did before `approve()` happens twice, exactly like a step redone after a crash: keep it idempotent, or move side effects into [effect tools](/guide/effect-tools).
:::

Other rules:

- **One approval per pause.** When several calls of one step suspend, the run waits on the first in call order; the others stay pending and ask again after the resume, before any model call. Calls of the step that finished keep their results and do not run again.
- **Pending calls get the same checks as the model's.** The `toolPolicy`, the tool's input schema, a third-party tool's context schema and the agent hooks apply again when a pending call runs; a tool the policy now refuses answers `ToolNotAllowedError`.
- **Budget.** A resumed approval gets one step beyond `maxSteps`, so an approval on the last step is still answered.
- **Streaming tools** (an `execute` returning an async iterable) cannot call `approve()` in their body (`InvalidRunStateError`); gate them in `beforeToolExecution`.
- AI SDK tools that declare their own `needsApproval` are refused when the agent is defined (`InvalidAgentDefinitionError`; a tools factory fails the run), since nothing answers that request.

## Asking through a channel

`approve()` on its own asks the [dashboard inbox](/guide/ui) and the API only. To ask where the owner is, call it on a [channel](/guide/channels):

<<< @/snippets/approvals.ts#channel

Once the wait point is stored, the engine sends one message of kind `approval` through the channel's `out` (key `<runId>:<approvalId>`, with the title, body, `approvalId` and `expiresAt`) and records `waiting.notifiedAt`. A failed send leaves it unset and `tick()` re-sends on every poll until one succeeds, under a store lock per approval so replicas never send at once; a crash between storing the wait point and the send re-sends under the same key. The message never carries the resume token: channels link to the approval in the UI instead. On GitHub the request becomes a comment on the run's issue, on OpenClaw a chat message.

## Gating tools you did not write

The coding tools, the GitHub tools and any third-party tool have an `execute` you cannot edit. Agent `hooks` run around **every** tool call of the merged set (yours, chamvi's, state tools, third-party), inside the call, so `approve()` works there and replays on resume:

<<< @/snippets/approvals.ts#hook

- `beforeToolExecution({ toolName, toolCallId, input }, ctx)` returns the input to use (a rewritten one is validated against the tool's input schema again; a failure is a `validation_error` tool error). It runs before the effect lookup, so an effect tool's key comes from the final input. Throw `ToolDeniedError` (`tool_denied`) to refuse: a tool error the model sees, the run goes on. `FatalToolError` still fails the run.
- `afterToolExecution({ toolName, toolCallId, input, output }, ctx)` returns the output the model sees. It runs on a fresh result and on a recorded effect result alike (redaction stays consistent), on a streaming tool's final value, and never for a tool error.
- `ctx` is the execution's `ToolContext`, so `inject()`, `ctx.channels` and `ctx.run.trigger.invoker` work in both. A hook can let some invokers through without asking (see [Restricting tools per invoker](/guide/tools#restricting-tools-per-invoker)).

## Answering

<<< @/snippets/approvals.ts#engine

<<< @/snippets/approvals.ts#answer

`engine.approve(runId, { approvalId, approved, reason?, approver? })` answers the run's current wait point, for a caller that authorized the approver itself (the `@chamvi/http` endpoint `POST /runs/:id/approve`, which the dashboard uses). An `approvalId` that is not the current one, an expired wait point (the next `tick()` denies it) or a run that is not `waiting` throws `InvalidRunStateError`.

`engine.resume(token, decision)` answers with a signed resume token instead. It verifies the token against the run's current wait point and takes the same path; a token answers its wait point once (a second `resume()` throws `InvalidRunStateError`), and a forged, malformed, expired or superseded one throws `InvalidResumeTokenError`.

- `decision.approver` (an invoker: `{ id, kind, name?, permissions }`) is recorded on the `wait` step as `output.approver`. `@chamvi/http` sets it from the principal that answered. The model never sees the decision's details: it sees the tool's result, so a denial is the tool's (or hook's) to word.
- If writing the answer fails, the run goes back to `waiting` and the answer can be sent again.
- The engine throws `InvalidAgentDefinitionError` for an empty `resumeSecret` (anyone could mint tokens with it).

## Timeouts

An approval not answered within its `timeoutMs` is denied with the reason `approval timed out`. The engine checks on every poll (`tick()`); `approve()` then returns `{ approved: false, reason: 'approval timed out' }`.

## Token format

```
base64url(JSON { runId, approvalId, tokenId, exp }) + "." + base64url(HMAC-SHA256(resumeSecret, payload))
```

The signature is compared in constant time, and a token expires at the wait point's `expiresAt`. `createResumeToken(secret, { runId, approvalId, tokenId, expiresAt })` and `verifyResumeToken(secret, token, now)` are exported for transports that hand tokens out themselves; no shipped channel puts one into a message.

::: tip Where approvals are answered
In core you call `engine.approve()` (by approval id) or `engine.resume()` (with a token) yourself. [`@chamvi/http`](/guide/http) adds the token-less `POST /runs/:id/approve` (needs `agent:<name>:approve`; the [`@chamvi/ui`](/guide/ui) inbox and its approval links answer through it), and the authenticated `POST /resume` endpoint and MCP `resume_run` tool (both need `agent:<name>:approve` besides the token).
:::
