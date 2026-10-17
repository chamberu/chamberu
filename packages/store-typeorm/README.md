<p align="center">
    <img src="https://raw.githubusercontent.com/chamberu/chamberu/master/.github/assets/logo.svg" alt="@chamberu/store-typeorm" width="128" height="128" />
</p>

<h1 align="center">@chamberu/store-typeorm</h1>

<p align="center">
    <b>TypeORM store for chamberu (PostgreSQL): durable runs, leases and agent state.</b><br>
    Runs, checkpoints, claims and state survive restarts, and several replicas<br>
    share one database without a leader.
</p>

<p align="center">
    <a href="https://www.npmjs.com/package/@chamberu/store-typeorm"><img src="https://img.shields.io/npm/v/@chamberu/store-typeorm" alt="npm version" /></a>
    <a href="https://github.com/chamberu/chamberu/actions/workflows/ci.yml"><img src="https://github.com/chamberu/chamberu/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="https://github.com/chamberu/chamberu/blob/master/packages/store-typeorm/LICENSE"><img src="https://img.shields.io/npm/l/@chamberu/store-typeorm" alt="License" /></a>
</p>

<p align="center">
    <a href="#installation"><b>Installation</b></a>
    ·
    <a href="#usage">Usage</a>
    ·
    <a href="#options">Options</a>
    ·
    <a href="#api">API</a>
    ·
    <a href="#notes">Notes</a>
</p>

---

## Why @chamberu/store-typeorm?

`MemoryStore` from `@chamberu/core` loses every queued run, waiting approval and checkpoint with the process, and it cannot be shared between replicas. `TypeormStore` keeps the same `IStore` contract in Postgres and passes the same `describeStoreContract` suite, so the engine behaves the same on both.

| Concern | `MemoryStore` | `TypeormStore` |
|---|---|---|
| **Restarts** | Everything is gone | Runs, steps, checkpoints, effects and state stay in Postgres; `recover()` picks interrupted runs up |
| **Replicas** | One process only | Claims, idempotency keys and locks are single statements built with TypeORM's query builder, atomic across processes |
| **Schema** | None | One migration, applied by `migrateStore()` under an advisory lock, so replicas booting at once migrate once |
| **Time** | From the injected `IClock` | From the injected `IClock` too, passed to every query as a parameter (never the database's `now()`) |
| **Housekeeping** | Nothing to clean up | `purgeExpired()` deletes expired idempotency keys and locks |

## Installation

```bash
npm install @chamberu/store-typeorm @chamberu/core typeorm pg
```

- ESM only, Node.js 22 or newer.
- `@chamberu/core`, `typeorm` (`^1.1.2`) and `pg` (`^8`) are peer dependencies.
- Postgres only.

## Usage

Create the data source with the store's entities and migrations, run the migrations, and hand the data source to the store:

```typescript
import type { LanguageModel } from 'ai';
import { RunEngine, defineAgent } from '@chamberu/core';
import {
    STORE_ENTITIES,
    STORE_MIGRATIONS,
    TypeormStore,
    migrateStore,
} from '@chamberu/store-typeorm';
import { DataSource } from 'typeorm';

export async function startEngine(model: LanguageModel) {
    const triage = defineAgent({
        name: 'triage',
        model,
        instructions: 'Triage the issue.',
    });

    const dataSource = new DataSource({
        type: 'postgres',
        url: process.env.DATABASE_URL,
        entities: STORE_ENTITIES,
        migrations: STORE_MIGRATIONS,
    });
    await dataSource.initialize();
    await migrateStore(dataSource);

    const store = new TypeormStore({ dataSource });
    const engine = new RunEngine({
        store,
        agents: [triage],
        resumeSecret: process.env.RESUME_SECRET!,
    });
    await engine.start();

    // the store never destroys the data source: drain first, then close it
    const shutdown = async () => {
        await engine.drain();
        await dataSource.destroy();
    };

    return { engine, store, shutdown };
}
```

- `migrateStore()` runs the pending migrations under the Postgres advisory lock `chamberu:migrations`. Several replicas may call it at once: they wait for each other and the migration is recorded once. Each call uses one pooled connection: it migrates on the connection that holds the lock.
- The store takes the data source as it is and never initializes or destroys it.
- The database must exist. Create it beforehand, for example with `createDatabase()` from `typeorm-extension`.

### Housekeeping

Expired idempotency keys and locks are taken over by the next caller, so they never block anything, but they stay in their tables until purged:

```typescript
// e.g. every hour; clear the interval on shutdown
const purge = setInterval(() => {
    store.purgeExpired().catch((e: unknown) => console.error(e));
}, 60 * 60 * 1000);
purge.unref();
```

`purgeExpired(now?)` deletes keys and locks expired at `now` (default: the clock's time) and returns `{ idempotencyKeys, locks }`, how many rows it removed. Effects have no expiry and are never purged.

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `dataSource` | `DataSource` | required | An initialized Postgres data source that lists `STORE_ENTITIES` and `STORE_MIGRATIONS` |
| `clock` | `IClock` | `systemClock` | Time source for claims, keys, locks and `updatedAt` |

## API

| Export | Kind | Purpose |
|---|---|---|
| `TypeormStore` | class | `IStore` on Postgres, plus `purgeExpired(now?)` |
| `migrateStore` | function | Runs the migrations under the advisory lock `MIGRATION_LOCK_NAME` |
| `STORE_ENTITIES` | array | The eight entity classes for the data source's `entities` |
| `STORE_MIGRATIONS` | array | The migrations for the data source's `migrations` |
| `MIGRATION_LOCK_NAME` | constant | `'chamberu:migrations'` |

Types: `TypeormStoreOptions`, `PurgeResult`.

## Notes

- **Tables are prefixed `chamberu_`:** `chamberu_runs`, `chamberu_steps`, `chamberu_checkpoints`, `chamberu_idempotency_keys`, `chamberu_locks`, `chamberu_effects`, `chamberu_kv`, `chamberu_docs`. They live in the data source's default schema.
- **Identifiers have length limits** (`MemoryStore` has none): a run id 128 characters; `concurrencyKey`, `thread`, claim owners, step names, document collections and document ids 255; idempotency, lock, effect and state keys 512. A longer value makes the write fail with the driver's `value too long` error, so validate user-supplied keys before they reach `dispatch` (a rejected run with an `idempotencyKey` keeps its key reserved until the key expires).
- **Only the latest checkpoint is kept** per run; an equal `stepIndex` replaces it.
- **Opaque values are JSON.** A run's `output`, a step's `input`/`output`/`error`, checkpoint messages, effect results and state values are stored as `jsonb`, so a `Date` inside them comes back as a string, `undefined` or `Map` values are lost and a typed array such as `Uint8Array` comes back as an object keyed by index. A `BigInt` or a circular structure makes the write throw a `TypeError` (`MemoryStore` accepts both). The run's own dates, `trigger.receivedAt`, `waiting.expiresAt` and `waiting.notifiedAt` come back as `Date`.
- **NUL characters and lone surrogates become U+FFFD** in opaque values (keys and strings alike), because `jsonb` cannot hold them. A literal backslash sequence such as the text `\u0000` is kept.
- **`null` in an optional property reads back as absent:** a run `output` of `null` and a step `input`, `output` or `error` of `null` are stored as SQL `NULL`. `putEffect(key, undefined)` reads back `{ result: null }`. `kvSet(agent, key, undefined)` deletes the key.
- **`docList` `where` uses `jsonb` containment (`@>`).** For primitive values that is top-level equality; a nested object or array matches by containment (`MemoryStore` never matches those). A key whose value is `undefined` matches documents that lack the key. Documents are returned ordered by `id` (`MemoryStore`: insertion order).
- **`listRuns` breaks `createdAt` ties by byte order of `id`** (`COLLATE "C"`, so `'B' < 'a'`); `MemoryStore` compares with `localeCompare`. Both agree for lowercase ids and UUIDs.
- **The schema may still change before 1.0.** New versions ship new migrations; run `migrateStore()` on every boot.

## License

Published under [Apache License 2.0](./LICENSE).
