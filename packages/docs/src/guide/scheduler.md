# Cron Scheduling

[`@chamberu/scheduler`](/reference/scheduler) fires the `cron()` triggers declared on your agents. Every replica runs the same scheduler; a lock in the shared store elects one replica per tick, and `engine.dispatch()` deduplicates a second firing of the same tick.

```bash
npm install @chamberu/scheduler @chamberu/core --save
```

<<< @/snippets/scheduler.ts#scheduler

`createScheduler()` creates one [hubwire](https://github.com/tada5hi/hubwire) scheduled component per cron trigger and validates every trigger up front: an expression or timezone the scheduler cannot use throws `InvalidAgentDefinitionError`, naming the agent and trigger, before `start()`. Pass the same `agents` list the engine was built with.

## One dispatch per tick

For a tick planned at `scheduledAt`, a replica:

1. acquires the store lock `cron:<agent>:<triggerId>:<scheduledAt ISO>` for `lockTtlMs` (default 10 minutes). The key is never released, so a replica that fires the same tick late cannot win it again. The other replicas skip the tick.
2. applies the trigger's [overlap policy](#overlap-policies).
3. dispatches with source `cron`, payload `options.payload ?? { scheduledAt }` (an ISO string) and the idempotency key `<triggerId>@<scheduledAt ISO>`. A trigger's own `idempotencyKey()` is ignored for cron.

Starting or restarting a replica fires nothing: the first dispatch is at the next scheduled tick. Missed ticks are not caught up, neither a tick that falls into a restart nor one whose timer fires `lockTtlMs` or more late. A failing lock store, overlap check or dispatch reaches `onError(error, { agent, trigger })`, and the next tick runs normally.

## Overlap policies

"Active" means a run of the same trigger in `queued`, `running`, `waiting` or `interrupted`.

| Policy | The tick is skipped when | Default `concurrencyKey` |
|---|---|---|
| `skip` (default) | any run of the trigger is active | the trigger id |
| `queue-one` | a run of the trigger is still `queued` | the trigger id |
| `allow` | never | none |

The default concurrency key makes `queue-one` wait: the engine starts one run per agent and key at a time (see [Concurrency](/guide/concurrency)), so the queued run starts when the active one settles. It also makes a race harmless: when a tick checks while the previous tick's dispatch is still in flight, the second run waits instead of running alongside. A `concurrencyKey(payload)` on the trigger wins over the default.

## Timezones

`cron(expression, { timezone })` takes an IANA zone; without one, the process's local zone applies. A local time that occurs twice at the fall-back change fires once, at its first occurrence. A local time the spring-forward change skips fires once, an hour later in local time.

## Shutdown

Stop the scheduler before draining the engine: `scheduler.stop()` unschedules every trigger and waits for ticks in flight, then `engine.drain()` waits for the runs. See [Cancel, Drain & Recovery](/guide/recovery#drain).

## One-shot jobs

`runJob()` fires one cron trigger once and waits for its run, for a Kubernetes CronJob instead of a long-lived replica:

<<< @/snippets/scheduler.ts#job

The tick is dispatched at the current time (the overlap policy applies). The engine is then started and runs one approval tick even when the tick is skipped, so leftovers of earlier jobs make progress: a run whose pod was killed is recovered, an interrupted or answered run is executed, and an approval past its timeout is denied. The job returns when the run is `completed` (exit code 0), `waiting` for an approval (0, the pod is not held), `queued` behind a run of the same trigger that waits for an approval (0, under `queue-one`), `failed` or `cancelled` (1), or `skipped` by the overlap policy (0). It polls `engine.getRun` every `pollMs`, so a run finished by another replica also ends the job. It never calls `process.exit`.

::: warning A job runs a full engine
`engine.start()` recovers and executes every queued run of every agent in the shared store, not only the cron run, and the final `drain()` interrupts whatever still runs after `drainTimeoutMs`. `runJob` waits only for its own run, so a leftover run is finished by a long-lived replica or by a later job pod, within that pod's `drainTimeoutMs`. Size `drainTimeoutMs` to the job's runs, and prefer a long-lived deployment with `createScheduler()` when runs are long.
:::
