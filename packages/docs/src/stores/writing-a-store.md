# Writing a Store

A store is any object that implements `IStore` from `@chamberu/core`. Pass it to `new Engine({ store })`; the engine needs nothing else.

## Prove it with the contract suite

`@chamberu/test-kit` ships `describeStoreContract`, the Vitest suite every store must pass. It is the same suite `MemoryStore` runs.

```bash
npm install --save-dev @chamberu/test-kit vitest
```

<<< @/snippets/store-contract.ts#contract

The factory gets a fresh `ControllableClock` per test and must return a fresh, empty store that uses that clock for every expiry decision. The factory may be async, for example to create a database schema.

The suite covers:

- atomicity under concurrency: parallel `claimKey`, `claimRun`, `acquire` and `createRun` calls have exactly one winner,
- expiry: keys, claims and locks expire after their TTL, and exactly at `expiresAt` they count as expired,
- `updateRun` guards: `expectStatus` (one or several allowed statuses) and `expectOwner`, `RunNotFoundError` for a missing run, untouched fields preserved,
- `claimRun` and `renewClaim` on a missing run resolve `false`,
- checkpoints: the highest `stepIndex` wins, an equal index replaces,
- locks: exclusive, released by their owner only, taken over after expiry,
- `listRuns` filters (`agent`, `status`, `concurrencyKey`), `total`, and the `createdAt`/`id` order,
- effect and state round trips, including `where` filters,
- artifacts: insert-if-absent, metadata and bytes round trips, copies, the `createdAt`/`id` order, unknown ids,
- no aliasing of values passed in or returned.

## Implementation notes

- **Do atomic work in one statement.** In SQL, a conditional `UPDATE ... WHERE ... RETURNING` or `INSERT ... ON CONFLICT` instead of a read followed by a write in JavaScript.
- **Pass the clock's time in.** Compare against `clock.now()` passed as a parameter, not the database's `now()`.
- **Revive dates.** `Run`, `Step`, `Checkpoint` and `WaitPoint` carry `Date` values (`createdAt`, `trigger.receivedAt`, `waiting.expiresAt`, `claim.expiresAt`, ...). Return them as `Date` objects.
- **Store messages as they are.** Checkpoint messages are AI SDK `ModelMessage` arrays; store them as JSON without reshaping.
- **Only the latest checkpoint is read.** Keeping older ones is optional.
- **Keep artifact bytes apart from their metadata.** `getArtifact` and `listArtifacts` should not load the bytes; only `readArtifact` needs them. Checkpoints refer to artifacts by id, never carry their bytes.

## Time in tests

`ControllableClock` implements `IClock` and moves only when you call `advance(ms)`, firing due timers in order. Pass the same clock to the store and to the engine to test leases, timeouts and approval expiry without real timers. See the [test-kit reference](/reference/test-kit).
