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
| `IArtifactStore` | Files of a run (attachments, files tools stored) | `putArtifact(artifact, data)` (insert-if-absent), `getArtifact` (metadata), `readArtifact` (bytes), `listArtifacts(runId)` |

`IStore` extends all eight.

## Rules every store keeps

1. **One expiry rule.** A claim, key or lock created at time `T` with `ttlMs` is expired at exactly `T + ttlMs` and can be taken over at that instant.
2. **Time comes from the clock.** Expiry decisions use an injected `IClock`, never the database's clock, so tests can drive time and replicas agree on one rule.
3. **No aliasing.** Values are copied in and out. Mutating an object after passing it to the store, or one the store returned, never changes what the store holds.
4. **Atomic means atomic across callers.** `createRun`, `claimKey`, `claimRun`, `renewClaim`, `acquire` and `putArtifact` must hold under concurrency, also across processes.
5. **Ordering.** `listRuns` orders by `createdAt` ascending, ties broken by `id` ascending, or both descending with `order: 'desc'` (newest first); `total` ignores `limit` and `offset`. `listArtifacts` orders the same way.
6. **Guards throw.** `updateRun` throws `InvalidRunStateError` when `expectStatus` does not match, or when `expectOwner` is given and the claim is absent or held by another owner (expiry is not checked there: a lease is lost once taken over). It throws `RunNotFoundError` for an unknown run.
7. **Checkpoints.** `saveCheckpoint` keeps the highest `stepIndex`; an equal index replaces.
8. **State filters.** `docList` `where` matches top-level fields by equality.
9. **Artifacts.** `putArtifact` resolves `false` and keeps the stored artifact when the id exists. Bytes are copied in and out like every other value, and `readArtifact` returns a plain `Uint8Array` (no `Buffer` or other subclass). `getArtifact` and `listArtifacts` return metadata only.

## The interfaces

<<< ../../../core/src/store/types.ts{ts}

## Stores

| Store | Package | Status |
|---|---|---|
| [`MemoryStore`](/stores/memory) | `@chamvi/core` | Shipped. Development and tests |
| [TypeORM](/stores/typeorm) | `@chamvi/store-typeorm` | Shipped. PostgreSQL, production |

Redis is never required. Any store that passes the [contract suite](/stores/writing-a-store) from `@chamvi/test-kit` works with the engine.
