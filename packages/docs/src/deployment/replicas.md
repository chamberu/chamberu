# Multiple Replicas

Running more than one replica of an agent app relies on the store. Core, the TypeORM store and `@chamvi/channel-cron` cover this today; part needs planned packages.

## What core already guarantees

With a shared, durable store such as the [TypeORM store](/stores/typeorm) (`MemoryStore` cannot be shared), several `Engine`s coordinate without a leader:

- **One executor per run.** Run claims are leases (`claimTtlMs`, renewed every third of it). A replica that loses its lease stops writing.
- **One run per concurrency key.** Checked under a store lock, across replicas.
- **One run per idempotency key.** `dispatch()` claims the key atomically; redeliveries to any replica return the same run.
- **Crash recovery.** Every replica's poll requeues runs whose claim expired, and the next execution continues from the latest checkpoint.
- **Graceful drain.** A terminating pod marks its unfinished runs `interrupted` and another replica picks them up.
- **Cross-replica cancel.** `cancel()` on any replica reaches the run's owner on its next poll.
- **One approval message.** A store lock per approval plus the message key (`<runId>:<approvalId>`) the channel dedupes on; a tool's `emit()` is recorded as an effect, so a redone step sends once.
- **Cron once per tick.** The cron channel ([`@chamvi/channel-cron`](/guide/scheduler)) takes a store lock per subscription and scheduled time (never released, so a late replica cannot fire the same tick again) and dispatches with an idempotency key built from the same pair. `engine.drain()` stops it before draining the runs.

Give each replica a distinct `owner` (the default `<hostname>-<pid>` already is in Kubernetes). See [Concurrency, Leases & Multi-Replica](/guide/concurrency).

## What still needs planned packages <Badge type="warning" text="Planned" />

- **Webhooks to any replica.** The planned HTTP app acknowledges webhooks with `202` and the run id, and uses the delivery id as the idempotency key, so a redelivery to another replica is deduplicated.

The planned Helm chart defaults to one replica with the `Recreate` strategy. Raising the replica count is safe once the store is shared.
