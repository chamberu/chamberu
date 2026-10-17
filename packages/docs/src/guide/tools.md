# Tools & Tool Errors

chamberu tools are AI SDK tools. Build them with `tool()` from `ai` and return them from the agent's `tools` factory. chamberu does not wrap or replace them, with one exception: [effect tools](/guide/effect-tools) are wrapped so their side effect applies at most once.

## Errors go back to the model

When a tool throws, the AI SDK turns the error into a tool error result and the model sees it on its next call. It can retry, try something else or give up. The run does not fail, and the step is recorded as a `tool` step with `error: { code, message }`.

The [step budget](/guide/budgets) caps retry loops: a model that keeps calling a failing tool runs out of steps and the run fails with `BudgetExceeded`.

## FatalToolError fails the run

Throw `FatalToolError` when continuing makes no sense: a missing credential, a forbidden target, a broken invariant.

<<< @/snippets/tools.ts#fatal

The run fails with `error.code` `FatalToolError`, or the code you pass as the second constructor argument (`new FatalToolError(message, 'MissingToken')`). The other tool calls of the same step still complete and are recorded before the run settles.

Infrastructure failures fail the run as well: a store write that throws, or an unknown agent.

## Cancellation inside tools

Every tool factory gets `run.signal`. It aborts on cancel, drain, timeout and a lost lease. Pass it to `fetch`, child processes and other cancellable work so an aborted run stops quickly.

## Tools with side effects

A recovered run repeats the step that was in progress when the process died. A plain tool that posts a comment would post it again. Use [`defineEffectTool()`](/guide/effect-tools) for every tool that changes something outside the run.
