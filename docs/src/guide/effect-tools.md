# Effect Tools & Reconciliation

An effect tool is an AI SDK tool whose side effect must apply **at most once per effect key**: a comment, a label, a push, a notification. `defineEffectTool()` takes the same definition as `tool()`, plus two optional hooks.

<<< @/snippets/effect-tools.ts#reconcile

## What happens on every call

The engine wraps every effect tool of a run. For each call it computes the effect key and then:

1. **Recorded result.** If the store holds a result for the key, it returns that result without running anything.
2. **Remote check.** Otherwise, if the tool has `alreadyApplied`, it asks whether the effect already exists remotely. A result other than `undefined` is recorded and returned.
3. **Execute.** Otherwise it runs `execute` and records the result.

A throwing `execute` (or `alreadyApplied`) records nothing, so a later retry can still apply the effect. Parallel identical calls within one step share one application.

## Effect keys

The default key is `<runId>:<toolName>:<sha256 of the canonical JSON input>`. Canonical means object keys are sorted, `undefined` is dropped and `toJSON` values such as `Date` are serialized through `toJSON`. Inputs with `BigInt` or cycles are not supported.

With the default key, the same call with the same input in the same run is applied once. Pass `effectKey(input, ctx)` when "the same effect" means something else, for example one comment per run and issue whatever the body says.

## The crash window

The result is recorded after `execute` returns. A crash between the side effect and the store write leaves no record, so the retry would apply the effect again. `alreadyApplied` closes that window: it checks the remote system before acting.

`effectMarker(key)` returns a hidden HTML comment, `<!-- chamberu:effect=<key> -->`. Embed it in what the tool creates (a comment body, a pull request description) so `alreadyApplied` can find it again. Other strategies:

- **Set semantics.** Adding a label that is already there changes nothing; such tools need no reconciliation.
- **Remote state.** Compare a remote ref or a commit trailer before pushing.
- **Idempotency keys.** Send the effect key as the `Idempotency-Key` of an HTTP API that supports it.

If recording the result fails after the effect happened, the call still succeeds; the failure is logged and `alreadyApplied` guards the next retry.

## Outside the engine

`wrapToolsForRun(tools, ctx, store)` applies the same wrapping to a `ToolSet` outside the engine, for example in a test or a custom loop. `ctx` is a `RunContext` (`runId`, `agent`, `trigger`, `signal`) and `store` any `IEffectStore`. Tools that are not effect tools pass through unchanged.

Streaming tools work too: when `execute` returns an async iterable, the last yielded value is the recorded result.
