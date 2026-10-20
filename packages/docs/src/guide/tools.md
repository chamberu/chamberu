# Tools & Tool Errors

chamberu tools are AI SDK tools. Build them with `tool()` from `ai`, or with `defineTool()` when a tool needs the run context (`context.run`, `context.state`, `context.artifacts`; see [Tools and their context](/guide/agents#tools-and-their-context)), and pass them to the agent's `tools`. chamberu does not wrap or replace them, with one exception: [effect tools](/guide/effect-tools) are wrapped so their side effect applies at most once.

## Errors go back to the model

When a tool throws, the AI SDK turns the error into a tool error result and the model sees it on its next call. It can retry, try something else or give up. The run does not fail, and the step is recorded as a `tool` step with `error: { code, message }`.

The [step budget](/guide/budgets) caps retry loops: a model that keeps calling a failing tool runs out of steps and the run fails with `BudgetExceeded`.

## FatalToolError fails the run

Throw `FatalToolError` when continuing makes no sense: a missing credential, a forbidden target, a broken invariant.

<<< @/snippets/tools.ts#fatal

The run fails with `error.code` `FatalToolError`, or the code you pass as the second constructor argument (`new FatalToolError(message, 'MissingToken')`). The other tool calls of the same step still complete and are recorded before the run settles.

Infrastructure failures fail the run as well: a store write that throws, or an unknown agent.

## Cancellation inside tools

Every tool built with `defineTool()` gets `context.run.signal` (a factory gets it as `run.signal`). It aborts on cancel, drain, timeout and a lost lease, and once the execution has ended (so work a tool left running does not outlive it). Pass it to `fetch`, child processes and other cancellable work so an aborted run stops quickly.

## Tools with side effects

A recovered run repeats the step that was in progress when the process died. A plain tool that posts a comment would post it again. Use [`defineEffectTool()`](/guide/effect-tools) for every tool that changes something outside the run.

## Restricting tools per invoker

A run started through `@chamberu/http` (REST or MCP) carries its **invoker**, `run.trigger.invoker`: `{ id, kind, name?, permissions }` of the authenticated principal (`kind` is the authenticator's label: `staticTokens()` sets `token` and `authup()` sets `authup`; `oidc()` keeps the kind its `principal` mapper returns, `oidc` in these docs). Cron and webhook runs have none. An agent's `toolPolicy(toolName, { run })` decides per tool whether the run may use it, and a refused tool is not offered to the model at all.

`requireToolPermission()` is the built-in policy: it offers a tool when the invoker holds `tool:<agent>:<tool>` (with the usual matching: `*` alone grants everything, a `*` segment matches one segment). Runs without an invoker get no tools unless you pass `{ withoutInvoker: 'allow' }`. Wrap it for exceptions:

<<< @/snippets/tools.ts#policy

- The policy covers the whole tool set, the generated [state tools](/guide/state) included.
- The invoker is a snapshot taken at dispatch. A run keeps it across approvals and restarts, so its tool set stays the same; revoking a grant later does not reach a run that already holds it.
- A model that calls a refused tool anyway gets the AI SDK's unavailable-tool error as the tool result; the tool step records it with code `tool_not_allowed`. The run goes on.
- The engine re-checks every call when it executes. An approved call from an older history (e.g. a policy tightened before the approval was answered) gets a `ToolNotAllowedError` tool error and the run goes on.
- The invoker only ever comes from an authenticator, never from a request body or payload.
- A tool reads the invoker as `context.run.trigger.invoker`.

## Third-party tools with their own context

A tool from another library may declare its own `contextSchema` and expect its context through the AI SDK. Give it one with the agent's `toolsContext`, keyed by tool name:

<<< @/snippets/tools.ts#third-party

- chamberu passes each entry unchanged, by reference, to the tool of that name: to every call of every run of the agent, so the value must be safe to share. It is never cloned, validated or stored; the tool's own `contextSchema` validates it.
- A tool without any `contextSchema` gets its entry too (the AI SDK hands it over unvalidated).
- An entry naming a chamberu tool (built with `defineTool()`/`defineEffectTool()`, the state tools included) or no tool of the agent is a misconfiguration: with a plain tool set `defineAgent()` throws `InvalidAgentDefinitionError`; with a factory (whose set is only known per execution) the run fails with that error (`invalid_agent_definition`) before any model call. A factory that returns a tool only sometimes must leave its entry out and close over the value instead.
- Without an entry, a tool whose `contextSchema` requires a value fails the run (the AI SDK validates the context outside its tool-error handling); an optional schema gets `undefined`.
- An entry the tool's `contextSchema` rejects fails the run the same way, with `validation_error`. The run error names the tool and the failing paths only, never the entry's value, so a key in it is not stored or served with the run.
