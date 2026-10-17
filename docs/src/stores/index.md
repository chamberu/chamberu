# Store Contract

Everything the engine persists goes through one interface, `IStore`. It is a set of small interfaces, so a store can be built and tested part by part.

| Interface | Holds | Key operations |
|---|---|---|
| `IRunStore` | Runs | `createRun` (insert-if-absent), `getRun`, `updateRun` with `expectStatus`/`expectOwner` guards, `listRuns`, `claimRun`/`renewClaim` leases |
| `IStepStore` | Append-only steps per run | `appendStep`, `listSteps` |
| `ICheckpointStore` | The latest checkpoint per run | `saveCheckpoint`, `latestCheckpoint` |
| `IIdempotencyStore` | Intake keys | `claimKey(scope, key, runId, ttlMs)`: the first caller wins |
| `ILockStore` | Keyed leases | `acquire(key, owner, ttlMs)`, `release(key, owner)` |
| `IEffectStore` | Recorded effect results | `getEffect`, `putEffect` |
| `IStateStore` | Per-agent state | `kvGet`/`kvSet`, `docList`/`docUpsert`/`docDelete` |

`IStore` extends all seven.

## Rules every store keeps

1. **One expiry rule.** A claim, key or lock created at time `T` with `ttlMs` is expired at exactly `T + ttlMs` and can be taken over at that instant.
2. **Time comes from the clock.** Expiry decisions use an injected `IClock`, never the database's clock, so tests can drive time and replicas agree on one rule.
3. **No aliasing.** Values are copied in and out. Mutating an object after passing it to the store, or one the store returned, never changes what the store holds.
4. **Atomic means atomic across callers.** `createRun`, `claimKey`, `claimRun`, `renewClaim` and `acquire` must hold under concurrency, also across processes.
5. **Ordering.** `listRuns` orders by `createdAt` ascending, ties broken by `id` ascending; `total` ignores `limit` and `offset`.
6. **Guards throw.** `updateRun` throws `InvalidRunStateError` when `expectStatus` does not match, or when `expectOwner` is given and the claim is absent or held by another owner (expiry is not checked there: a lease is lost once taken over). It throws `RunNotFoundError` for an unknown run.
7. **Checkpoints.** `saveCheckpoint` keeps the highest `stepIndex`; an equal index replaces.
8. **State filters.** `docList` `where` matches top-level fields by equality.

## The interfaces

<<< ../../../packages/core/src/store/types.ts{ts}

## Stores

| Store | Package | Status |
|---|---|---|
| [`MemoryStore`](/stores/memory) | `@chamberu/core` | Shipped. Development and tests |
| [Postgres / TypeORM](/stores/typeorm) | `@chamberu/store-typeorm` | <Badge type="warning" text="Planned" /> |

Redis is never required. Any store that passes the [contract suite](/stores/writing-a-store) from `@chamberu/test-kit` works with the engine.
