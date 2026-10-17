<p align="center">
    <img src="https://raw.githubusercontent.com/chamberu/chamberu/master/.github/assets/logo.svg" alt="@chamberu/scheduler" width="128" height="128" />
</p>

<h1 align="center">@chamberu/scheduler</h1>

<p align="center">
    <b>Fires chamberu cron triggers once per tick across replicas, on hubwire.</b><br>
    Every replica runs the same scheduler. A lock in the store elects one per tick,<br>
    and the same package fires a trigger one-shot for a Kubernetes CronJob.
</p>

<p align="center">
    <a href="https://www.npmjs.com/package/@chamberu/scheduler"><img src="https://img.shields.io/npm/v/@chamberu/scheduler" alt="npm version" /></a>
    <a href="https://github.com/chamberu/chamberu/actions/workflows/ci.yml"><img src="https://github.com/chamberu/chamberu/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="https://github.com/chamberu/chamberu/blob/master/packages/scheduler/LICENSE"><img src="https://img.shields.io/npm/l/@chamberu/scheduler" alt="License" /></a>
</p>

---

**Table of Contents**
- [Installation](#installation)
- [Usage](#usage)
- [How a tick works](#how-a-tick-works)
- [Overlap policies](#overlap-policies)
- [Timezones](#timezones)
- [Shutdown](#shutdown)
- [One-shot jobs](#one-shot-jobs)
- [Options](#options)
- [API](#api)
- [License](#license)

## Installation

```bash
npm install @chamberu/scheduler @chamberu/core --save
```

ESM only, Node.js `>=22`. `@chamberu/core` is a peer dependency; [`hubwire`](https://www.npmjs.com/package/hubwire) (croner inside) is installed with the package.

## Usage

`cron()` declares the trigger on the agent; `createScheduler()` fires it:

```typescript
import type { LanguageModel } from 'ai';
import {
    MemoryStore,
    RunEngine,
    cron,
    defineAgent,
} from '@chamberu/core';
import { createScheduler } from '@chamberu/scheduler';

export async function startScheduling(model: LanguageModel) {
    const sweep = defineAgent({
        name: 'sweep',
        model,
        instructions: 'Close stale issues older than 30 days.',
        // every 30 minutes, Berlin time; skipped while the previous run is active
        triggers: [cron('*/30 * * * *', { timezone: 'Europe/Berlin' })],
    });

    const agents = [sweep];
    // MemoryStore is per process; with several replicas, pass one shared store
    // (e.g. TypeormStore) so its lock fires each tick once across them
    const store = new MemoryStore();
    const engine = new RunEngine({
        store,
        agents,
        resumeSecret: 'change-me',
    });
    // every replica runs the same scheduler against that store
    const scheduler = createScheduler({
        engine,
        agents,
        store,
    });

    await engine.start();
    await scheduler.start();

    // shutdown: stop scheduling first, then let the runs in flight finish
    // await scheduler.stop();
    // await engine.drain();
    return { scheduler, engine };
}
```

`createScheduler()` validates every cron trigger up front and throws `InvalidAgentDefinitionError` (naming the agent and trigger) for an expression or timezone the scheduler cannot use, before `start()`. Non-cron triggers are ignored.

## How a tick works

- **One component per cron trigger.** Each becomes a hubwire scheduled component named `cron:<agent>:<triggerId>`.
- **One replica per tick.** Before a tick runs, the replica acquires the store lock `cron:<agent>:<triggerId>:<scheduledAt ISO>` (through `ILockStore`) for `lockTtlMs` (default 10 minutes). The key is never released: a replica that fires the same tick late cannot win it again.
- **Deduplicated dispatch.** The winner calls `engine.dispatch()` with source `cron`, payload `options.payload ?? { scheduledAt: '<ISO>' }` and the idempotency key `<triggerId>@<scheduledAt ISO>`, so even a second firing of the same tick returns the existing run. A trigger's own `idempotencyKey()` is ignored for cron.
- **Never on start.** Starting or restarting a replica fires nothing; the first dispatch is at the next scheduled tick.
- **No catch-up.** A tick that falls into a restart, or whose timer fires `lockTtlMs` or more late (a suspended process), is not fired later.
- **Failures are reported, not thrown.** A failing lock store, overlap check or dispatch reaches `onError(error, { agent, trigger })`; the next tick runs normally.

## Overlap policies

`cron(expression, { overlap })` sets the policy; the scheduler enforces it before dispatching. "Active" means a run of the same trigger in `queued`, `running`, `waiting` or `interrupted`.

| Policy | Tick is skipped when | Default `concurrencyKey` |
|---|---|---|
| `skip` (default) | any run of the trigger is active | the trigger id |
| `queue-one` | a run of the trigger is still `queued` | the trigger id |
| `allow` | never | none |

A `concurrencyKey()` on the trigger wins over the default. The default key is what makes `queue-one` wait: the engine starts one run per agent and key at a time, so the queued run starts when the active one settles. It also makes a race harmless: a tick that checks while the previous tick's dispatch is still in flight may dispatch a second run, which then waits instead of running alongside.

## Timezones

`cron(expression, { timezone: 'Europe/Berlin' })` takes an IANA zone; without one, the process's local zone applies. At DST changes:

- A local time that occurs twice (fall-back) fires once, at its first occurrence.
- A local time the spring-forward change skips fires once, an hour later in local time (`30 2 * * *` fires at 03:30).

## Shutdown

Stop scheduling first, then drain the engine:

```ts
await scheduler.stop(); // no new ticks; waits for ticks in flight
await engine.drain();   // waits for running runs, then interrupts the rest
```

## One-shot jobs

`runJob()` fires one cron trigger once and waits for its run, for a Kubernetes CronJob instead of a long-lived replica:

```ts
const { exitCode } = await runJob({ engine, store, agent: sweep });
process.exitCode = exitCode;
```

It dispatches the tick at the current time (the overlap policy applies), starts the engine and runs one approval tick (also when the tick is skipped), waits until the run is `completed`, `failed`, `cancelled` or `waiting`, or `queued` behind a run of the same trigger that waits for an approval, then calls `engine.drain()`.

| Outcome | `status` | `exitCode` |
|---|---|---|
| The run completed | `completed` | `0` |
| The run waits for an approval | `waiting` | `0` |
| The run waits behind a run paused for an approval (`queue-one`) | `queued` | `0` |
| The overlap policy skipped the tick | `skipped` | `0` |
| The run failed or was cancelled | `failed`, `cancelled` | `1` |

A run that pauses for an approval does not hold the pod: the job returns, the approval is answered through `engine.resume()` (or times out), and the answered run is executed by a long-lived replica or by the next job pod, which starts the engine even when its own tick is skipped. That pod also recovers a run whose pod was killed and denies approvals past their timeout. Caveats:

- `engine.start()` recovers and executes **every** queued run of **every** agent in the shared store, not only the cron run.
- `drain()` interrupts whatever still runs after `drainTimeoutMs`. `runJob` waits only for the run it dispatched, so a leftover run is finished by a long-lived replica or by a later job pod, within that pod's `drainTimeoutMs`.
- Size `drainTimeoutMs` to the job's runs, and prefer a long-lived deployment with `createScheduler()` when runs are long.

## Options

`createScheduler(options)`:

| Option | Type | Default | Description |
|---|---|---|---|
| `engine` | `RunEngine` | required | Dispatches the runs |
| `agents` | `Agent[]` | required | The agents whose cron triggers are scheduled; the same list the engine was built with |
| `store` | `IStore` | required | Holds the tick locks and the runs the overlap check reads |
| `owner` | `string` | `` `${hostname}-${pid}` `` | Lock owner |
| `lockTtlMs` | `number` | `600_000` | How long a tick's lock key is held; a tick firing this late or later is skipped |
| `onError` | `(error, { agent, trigger }) => void` | `console.error` | Failing ticks |

`runJob(options)`:

| Option | Type | Default | Description |
|---|---|---|---|
| `engine` | `RunEngine` | required | Not started yet; started and drained by the job, also when the tick is skipped |
| `store` | `IStore` | required | The store the engine uses |
| `agent` | `Agent` | required | The agent to fire |
| `trigger` | `string` | the only cron trigger | Cron trigger id; required when the agent has several |
| `clock` | `IClock` | `systemClock` | Gives `scheduledAt` and drives the poll |
| `pollMs` | `number` | `1_000` | Poll of `engine.getRun`, which also sees a run finished by another replica |
| `drainTimeoutMs` | `number` | `30_000` | Passed to `engine.drain()` |

## API

| Export | Kind | Purpose |
|---|---|---|
| `createScheduler` | function | Schedules every cron trigger of the agents; returns `{ start, stop }` |
| `runJob` | function | Fires one cron trigger once and waits for its run |
| `fireCronTrigger` | function | One tick: overlap check and dispatch, for a given `scheduledAt` |
| `readCronOptions` | function | Reads and validates the options `cron()` stores on a trigger |
| `createStoreScheduleLock` | function | A hubwire `IScheduleLock` over core's `ILockStore` |
| `SCHEDULE_LOCK_TTL_MS` | constant | The default lock TTL, `600_000` |

Types: `IScheduler`, `SchedulerOptions`, `SchedulerErrorContext`, `RunJobOptions`, `RunJobResult`, `CronTriggerOptions`, `CronTickContext`, `CronTickResult`, `CronTickDispatched`, `CronTickSkipped`.

## License

Published under [Apache License 2.0](./LICENSE).
