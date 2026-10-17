# @chamberu/scheduler

Fires chamberu cron triggers once per tick across replicas, on hubwire. The public API of `packages/scheduler/src/index.ts`.

```bash
npm install @chamberu/scheduler @chamberu/core --save
```

`@chamberu/core` is a peer dependency. See [Cron Scheduling](/guide/scheduler) for the behaviour.

## createScheduler

```ts
function createScheduler(opts: SchedulerOptions): IScheduler;

const SCHEDULE_LOCK_TTL_MS: 600_000;
```

Throws `InvalidAgentDefinitionError` for a duplicate agent name or a cron trigger the scheduler cannot use (expression, timezone, `lockTtlMs`).

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
