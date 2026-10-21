# @chamvi/scheduler

Fires chamvi cron triggers once per tick across replicas, on hubwire. The public API of `packages/scheduler/src/index.ts`.

```bash
npm install @chamvi/scheduler @chamvi/core --save
```

`@chamvi/core` is a peer dependency. See [Cron Scheduling](/guide/scheduler) for the behaviour.

## createScheduler

```ts
function createScheduler(opts: SchedulerOptions): IScheduler;

const SCHEDULE_LOCK_TTL_MS: 600_000;
```

Schedules `engine.listAgents()` (or only the agents named in `agents`) and locks over `engine.store`. Throws `InvalidAgentDefinitionError` for a cron trigger the scheduler cannot use (expression, timezone, `lockTtlMs`) and for a name in `agents` the engine lacks or that is given twice.

<<< ../../../scheduler/src/scheduler/types.ts{ts}

## runJob

```ts
function runJob(opts: RunJobOptions): Promise<RunJobResult>;
```

Rejects with `InvalidAgentDefinitionError` when the trigger is missing or ambiguous.

<<< ../../../scheduler/src/run-job/types.ts{ts}

## Building blocks

```ts
function fireCronTrigger(ctx: CronTickContext): Promise<CronTickResult>;
function readCronOptions(agent: Agent, trigger: TriggerDefinition): CronTriggerOptions;
function createStoreScheduleLock(store: ILockStore, owner: string): IScheduleLock;
```

`fireCronTrigger` is one tick (overlap check and dispatch) for an explicit `scheduledAt`; `createScheduler` and `runJob` both call it. `createStoreScheduleLock` adapts core's `ILockStore` to hubwire's `IScheduleLock`.

<<< ../../../scheduler/src/tick/types.ts{ts}
