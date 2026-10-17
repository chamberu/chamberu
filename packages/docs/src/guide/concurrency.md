# Concurrency, Leases & Multi-Replica

Several engines can share one store. They coordinate through the store alone: run claims are leases, concurrency keys are checked under store locks, and idempotency keys are claimed atomically. There is no leader and no extra service.

::: warning Durable store required
`MemoryStore` lives in one process, so replicas cannot share it. Running several replicas needs a durable, shared store such as the planned [Postgres store](/stores/typeorm).
:::

## Local slots

`maxConcurrentRuns` (default `4`) caps the runs one engine executes at once. A scheduling pass lists `queued` runs in FIFO order (by `createdAt`, then `id`) and starts them until the slots are full. Passes run after a dispatch, after a run settles, after a resume and on every poll.

A `waiting` run holds no slot. A long approval wait does not block other work.

## Concurrency keys

A run with a `concurrencyKey` starts only when no other run of the same agent and key is `running`, `waiting` or `interrupted`. The check, the claim and the move to `running` happen under the store lock `concurrency:<agent>:<key>`, so two replicas cannot both start a run for the same key. A blocked run stays `queued` and later runs with other keys start past it.

Note what blocks a key:

- `waiting`: a run paused on an approval keeps its key, so the next run for the same issue does not start while the owner decides.
- `interrupted`: a drained run keeps its key until it is recovered and finished.

## Claims are leases

A run is executed by the engine that holds its claim. `claimRun(id, owner, claimTtlMs)` takes the lease (default 60 s) and the engine renews it every `claimTtlMs / 3` while the run executes.

- **Owner:** `owner` identifies the replica, by default `<hostname>-<pid>`. Give each replica a distinct owner.
- **Conditional writes:** every write of a running run checks the status and that this owner still holds the claim.
- **Lost lease:** when a renewal is refused, or another owner took the run over after the lease expired, the engine aborts its execution, writes nothing more and reports a `LeaseLostError` to `onError`. The new owner continues from the latest checkpoint.

## The poll

Every `claimTtlMs / 3` each started engine:

1. runs `tick()`: denies expired approvals and re-sends undelivered approval notifications,
2. runs `recover()`: requeues `running` or `interrupted` runs whose claim expired or was released, and aborts local runs another replica asked to cancel,
3. runs a scheduling pass.

So a crashed replica's runs are picked up by another replica within about one lease plus one poll interval.

## Tuning `claimTtlMs`

A shorter lease recovers crashed runs sooner and polls more often. A longer lease tolerates longer pauses (a slow store, a stop-the-world GC) before another replica takes a run over. The default of 60 s polls every 20 s.

## Cron across replicas

Firing a cron trigger once across replicas needs a per-tick lock. [`@chamberu/scheduler`](/guide/scheduler) takes the store lock `cron:<agent>:<triggerId>:<scheduledAt>` per tick (never released, held for 10 minutes by default) and dispatches with the idempotency key `<triggerId>@<scheduledAt>`, so a second firing is harmless even if the lock failed. See [Cron Scheduling](/guide/scheduler) and [Multiple Replicas](/deployment/replicas).
