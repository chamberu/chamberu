# Postgres / TypeORM

`@chamberu/store-typeorm` keeps everything the engine persists in Postgres through TypeORM. It passes `describeStoreContract` unchanged, so the engine behaves the same on memory and on Postgres, also with several replicas on one database.

```bash
npm install @chamberu/store-typeorm typeorm pg
```

`@chamberu/core`, `typeorm` (`^1.1.2`) and `pg` (`^8`) are peer dependencies.

## Setup

<<< @/snippets/store-typeorm.ts#setup

The store takes an initialized `DataSource` and never initializes or destroys it. The database must exist; create it beforehand, for example with `createDatabase()` from `typeorm-extension`.

| Option | Type | Default | Description |
|---|---|---|---|
| `dataSource` | `DataSource` | required | An initialized Postgres data source that lists `STORE_ENTITIES` and `STORE_MIGRATIONS` |
| `clock` | `IClock` | `systemClock` | Time source for claims, keys, locks and `updatedAt` |

## Migrations

`migrateStore(dataSource)` runs the pending migrations under the Postgres advisory lock `chamberu:migrations` (`MIGRATION_LOCK_NAME`). Call it on every boot: replicas that start at once wait for each other, and each migration is applied and recorded once. chamberu is pre-1.0, so a new version may ship a new migration.

## Tables

| Table | Holds | Keys and indexes |
|---|---|---|
| `chamberu_runs` | Runs; JSON columns for trigger, output, error, usage and wait point; claim owner and expiry | PK `id` (`COLLATE "C"`); `(agent, status, concurrency_key)`; `(status, created_at, id)` |
| `chamberu_steps` | Append-only steps | `(run_id, step_index)` |
| `chamberu_checkpoints` | The latest checkpoint per run | PK `run_id` |
| `chamberu_idempotency_keys` | Intake keys | PK `(scope, key)`; `expires_at` |
| `chamberu_locks` | Keyed leases | PK `key`; `expires_at` |
| `chamberu_effects` | Recorded effect results | PK `key` |
| `chamberu_kv` | Agent key-value state | PK `(agent, key)` |
| `chamberu_docs` | Agent document collections | PK `(agent, collection, id)`; GIN index on `doc` |

## How it keeps the contract

- **One statement per atomic operation**, never read-then-write in JavaScript:
  - `createRun`: `INSERT ... ON CONFLICT (id) DO NOTHING RETURNING id`.
  - `claimKey` and `acquire`: `INSERT ... ON CONFLICT DO UPDATE ... WHERE expires_at <= now RETURNING`, so an expired key or lock is taken over in the same statement.
  - `claimRun`, `renewClaim` and the `updateRun` guards: a conditional `UPDATE ... RETURNING`; when it matches no row, the store reads the run to throw `RunNotFoundError` or `InvalidRunStateError`.
  - `saveCheckpoint`: `INSERT ... ON CONFLICT (run_id) DO UPDATE ... WHERE step_index <= EXCLUDED.step_index`.
- **Time from the clock.** The injected `IClock`'s time is passed as a parameter; SQL never calls `now()`.
- **No aliasing.** Values are serialized into SQL and parsed out again; nothing is cached in memory.
- **Dates.** Timestamps are `timestamptz`; `trigger.receivedAt`, `waiting.expiresAt` and `waiting.notifiedAt` live in JSON and are revived as `Date`.

## Housekeeping

Expired idempotency keys and locks never block anyone, but they stay in their tables until purged:

<<< @/snippets/store-typeorm.ts#purge

`purgeExpired(now?)` deletes keys and locks expired at `now` (default: the clock's time) and returns `{ idempotencyKeys, locks }`, the number of rows removed. Effects have no expiry and are never purged. The planned scheduler will run it as a maintenance job.

## Differences from MemoryStore

- **Opaque values are JSON.** A run's `output`, step `input`/`output`/`error`, checkpoint messages, effect results and state lose `Date`, `undefined` and `Map` fidelity, and a typed array such as `Uint8Array` comes back as an object keyed by index. A `BigInt` or a circular structure makes the write throw a `TypeError`.
- **NUL characters and lone surrogates become U+FFFD** in opaque values, keys and strings alike, because `jsonb` cannot hold them.
- **A JSON `null` in a nullable column reads back as absent:** a run `output` of `null`, and a step `input`, `output` or `error` of `null`. `putEffect(key, undefined)` reads back `{ result: null }`.
- **`docList` `where` uses `jsonb` containment (`@>`).** Primitive values match by top-level equality; a nested object or array matches by containment, where `MemoryStore` never matches. A key whose value is `undefined` matches documents that lack the key, as in `MemoryStore`. Documents come back ordered by `id`, not by insertion.
- **`listRuns` ties** on `createdAt` are broken by the byte order of `id` (`COLLATE "C"`, so `'B' < 'a'`); identical to `MemoryStore` for lowercase ids and UUIDs.
