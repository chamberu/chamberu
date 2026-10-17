# TypeORM store

`@chamberu/store-typeorm` keeps everything the engine persists in Postgres through TypeORM. It passes `describeStoreContract` unchanged, so the engine behaves the same on memory and on Postgres, also with several replicas on one database.

```bash
npm install @chamberu/store-typeorm typeorm pg
```

`@chamberu/core`, `typeorm` (`^1.1.2`) and `pg` (`^8`) are peer dependencies.

## Setup

<<< @/snippets/store-typeorm.ts#setup

The store takes an initialized `DataSource` and never initializes or destroys it. The database must exist; create it beforehand, for example with `createDatabase()` from `typeorm-extension`.

On shutdown, drain the engine before destroying the data source:

<<< @/snippets/store-typeorm.ts#shutdown

| Option | Type | Default | Description |
|---|---|---|---|
| `dataSource` | `DataSource` | required | An initialized Postgres data source that lists `STORE_ENTITIES` and `STORE_MIGRATIONS` |
| `clock` | `IClock` | `systemClock` | Time source for claims, keys, locks and `updatedAt` |

## Migrations

`migrateStore(dataSource)` runs the pending migrations under the Postgres advisory lock `chamberu:migrations` (`MIGRATION_LOCK_NAME`). Call it on every boot: replicas that start at once wait for each other, and each migration is applied and recorded once. Each call uses one pooled connection, the one holding the lock, for the migrations as well. chamberu is pre-1.0, so a new version may ship a new migration.

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

- **Repositories and query builders.** Every method goes through the entities' TypeORM repositories and query builders; the only hand-written fragment is the `jsonb_exists` key check in `docList`, which TypeORM has no operator for.
- **One statement per atomic operation**, never read-then-write in JavaScript:
  - `createRun`: an insert with `orIgnore()` (`ON CONFLICT DO NOTHING RETURNING id`).
  - `claimKey` and `acquire`: an insert with `orUpdate()` and an overwrite condition (`ON CONFLICT DO UPDATE ... WHERE expires_at <= now RETURNING`), so an expired key or lock is taken over in the same statement.
  - `claimRun` and `renewClaim`: a conditional update (`UPDATE ... WHERE ...`) checked by its affected-row count.
  - The `updateRun` guards: a conditional update with `RETURNING *`; when it matches no row, the store reads the run to throw `RunNotFoundError` or `InvalidRunStateError`.
  - `saveCheckpoint`: an insert with `orUpdate()` and the overwrite condition `step_index <=` the new index.
- **Time from the clock.** The injected `IClock`'s time is passed as a parameter; queries never call the database's `now()`.
- **No aliasing.** Values are serialized into the query and parsed out again; nothing is cached in memory.
- **Dates.** Timestamps are `timestamptz`; `trigger.receivedAt`, `waiting.expiresAt` and `waiting.notifiedAt` live in JSON and are revived as `Date`.

## Housekeeping

Expired idempotency keys and locks never block anyone, but they stay in their tables until purged:

<<< @/snippets/store-typeorm.ts#purge

`purgeExpired(now?)` deletes keys and locks expired at `now` (default: the clock's time) and returns `{ idempotencyKeys, locks }`, the number of rows removed. Effects have no expiry and are never purged. Nothing runs it automatically yet, so schedule it in your app as above.

## Differences from MemoryStore

- **Opaque values are JSON.** A run's `output`, step `input`/`output`/`error`, checkpoint messages, effect results and state lose `Date`, `undefined` and `Map` fidelity, and a typed array such as `Uint8Array` comes back as an object keyed by index. A `BigInt` or a circular structure makes the write throw a `TypeError`.
- **NUL characters and lone surrogates become U+FFFD** in opaque values, keys and strings alike, because `jsonb` cannot hold them.
- **Identifiers have length limits** (`MemoryStore` has none): a run id 128 characters; `concurrencyKey`, `thread`, claim owners, step names, document collections and document ids 255; idempotency, lock, effect and state keys 512. A longer value makes the write fail with the driver's `value too long` error, so validate user-supplied keys before they reach `dispatch` (a rejected run with an `idempotencyKey` keeps its key reserved until the key expires).
- **`null` in an optional property reads back as absent:** a run `output` of `null`, and a step `input`, `output` or `error` of `null`, are stored as SQL `NULL`. `putEffect(key, undefined)` reads back `{ result: null }` and `docUpsert(..., undefined)` reads back `doc: null`.
- **`docList` `where` uses `jsonb` containment (`@>`).** Primitive values match by top-level equality; a nested object or array matches by containment, where `MemoryStore` never matches. A key whose value is `undefined` matches documents that lack the key, as in `MemoryStore`. Documents come back ordered by `id`, not by insertion.
- **`listRuns` ties** on `createdAt` are broken by the byte order of `id` (`COLLATE "C"`, so `'B' < 'a'`); identical to `MemoryStore` for lowercase ids and UUIDs.
