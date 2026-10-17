# Postgres / TypeORM <Badge type="warning" text="Planned" />

::: warning Planned
`@chamberu/store-typeorm` does not exist yet. This page describes the plan; names and details may change.
:::

The production store will keep everything in Postgres through TypeORM, with migrations from `typeorm-extension`. Its goal: pass `describeStoreContract` unchanged, so the engine behaves the same on memory and on Postgres, including across replicas.

## Planned design

- **Setup:** a store created from a TypeORM `DataSource`, implementing the full `IStore`.
- **Atomicity in SQL:** `INSERT ... ON CONFLICT` for `createRun` and `claimKey` (an expired key can be taken again), single conditional `UPDATE ... RETURNING` statements for claims, renewals and locks, and the `updateRun` guards in the `WHERE` clause.
- **Time from the injected clock**, not from `now()` in SQL, so the contract's controllable clock works.
- **JSON columns** (`jsonb`) for triggers, payloads, outputs, errors, usage, wait points, step data, checkpoint messages, effect results and state; `timestamptz` for dates.
- **Tables:** runs, steps, checkpoints, idempotency keys, locks, effects, key-value state and documents, with indexes for the scheduler's queries and a GIN index for document filters.
- **Latest checkpoint only** per run.
- **Tests:** the contract suite against a real Postgres, and two engines with different owners on one database to exercise drain and recovery across replicas.

Until it ships, `MemoryStore` is the only store, and runs do not survive a restart.
