import type { Clock } from '../clock.ts';
import type { Run } from '../run/types.ts';
import type { Store } from '../store/types.ts';

export interface RunQueueOptions {
    store: Store;
    clock: Clock;
    owner: string;
    maxConcurrentRuns: number;
    claimTtlMs: number;
    /** Called once a run is claimed and marked `running`. Must settle the run. */
    execute: (run: Run) => Promise<void>;
    /** Called for every run mutation performed by the queue. */
    onRunUpdated: (run: Run) => void;
    onError: (error: unknown, run?: Run) => void;
}

const groupKey = (run: Pick<Run, 'agent' | 'concurrencyKey'>) => `${run.agent}\u0000${run.concurrencyKey}`;

/**
 * Concurrency-aware scheduler: starts queued runs in FIFO order of createdA
 * when (a) a local slot is free, (b) no run of the same agent + concurrencyKey
 * is running or waiting (checked in the store, as replicas share it) and
 * (c) the run claim succeeds.
 */
export class RunQueue {
    protected readonly opts: RunQueueOptions;

    /** run id to the group key (only keyed runs) of runs executing in this process. */
    protected running = new Map<string, string | undefined>();

    protected inflight = new Set<Promise<void>>();

    protected pumping: Promise<void> | undefined;

    protected again = false;

    protected poll: { clear(): void } | undefined;

    constructor(opts: RunQueueOptions) {
        this.opts = opts;
    }

    /** Re-run scheduling every claimTtlMs/3, so runs unblocked elsewhere (other replicas) get picked up. */
    startPolling(): void {
        if (this.poll) return;
        const tick = () => {
            this.poll = this.opts.clock.setTimeout(() => {
                void this.pump().then(() => {
                    if (this.poll) tick();
                });
            }, Math.max(1, Math.floor(this.opts.claimTtlMs / 3)));
        };
        tick();
    }

    stopPolling(): void {
        this.poll?.clear();
        this.poll = undefined;
    }

    /** Request a scheduling pass; coalesces overlapping requests. */
    pump(): Promise<void> {
        if (this.pumping) {
            this.again = true;
            return this.pumping;
        }
        this.pumping = (async () => {
            try {
                do {
                    this.again = false;

                    await this.pass();
                } while (this.again);
            } catch (error) {
                this.opts.onError(error);
            } finally {
                this.pumping = undefined;
            }
        })();
        return this.pumping;
    }

    /** Resolves when nothing is running and nothing more can be started. */
    async idle(): Promise<void> {
        while (this.pumping || this.inflight.size > 0) {
            await Promise.all([this.pumping, ...this.inflight]);
        }
    }

    protected async pass(): Promise<void> {
        if (this.running.size >= this.opts.maxConcurrentRuns) return;
        const { store } = this.opts;
        const { data: queued } = await store.listRuns({ status: ['queued'] });
        for (const run of queued) {
            if (this.running.size >= this.opts.maxConcurrentRuns) return;

            const started = await this.tryStart(run);
            if (started) this.launch(started);
        }
    }

    protected async tryStart(run: Run): Promise<Run | undefined> {
        const {
            store,
            owner,
            claimTtlMs,
        } = this.opts;
        if (run.concurrencyKey === undefined) return this.transition(run, undefined);

        // keyed runs: check + claim + mark running must be atomic across replicas
        const lockKey = `concurrency:${run.agent}:${run.concurrencyKey}`;
        if (!await store.acquire(lockKey, owner, claimTtlMs)) return undefined;
        try {
            return await this.transition(run, groupKey(run));
        } finally {
            await store.release(lockKey, owner);
        }
    }

    protected async transition(run: Run, group: string | undefined): Promise<Run | undefined> {
        const {
            store,
            clock,
            owner,
            claimTtlMs,
        } = this.opts;
        if (group !== undefined) {
            if (this.running.values().toArray().includes(group)) return undefined;
            const { total } = await store.listRuns({
                agent: run.agent,
                status: ['running', 'waiting'],
                concurrencyKey: run.concurrencyKey,
                limit: 1,
            });
            if (total > 0) return undefined;
        }
        if (!await store.claimRun(run.id, owner, claimTtlMs)) return undefined;
        // reserve the slot before the next await so concurrent passes cannot overshoo
        this.running.set(run.id, group);
        try {
            const now = clock.now();
            return await store.updateRun(run.id, {
                status: 'running',
                startedAt: now,
                updatedAt: now,
            }, { expectStatus: ['queued'] });
        } catch {
            this.running.delete(run.id);
            return undefined;
        }
    }

    protected launch(run: Run): void {
        this.opts.onRunUpdated(run);
        const renewal = this.keepClaim(run.id);
        const task: Promise<void> = this.opts.execute(run)
            .catch((error: unknown) => this.opts.onError(error, run))
            .finally(() => {
                renewal.stop();
                this.running.delete(run.id);
            })
            .then(() => this.pump())
            .finally(() => {
                this.inflight.delete(task);
            });
        this.inflight.add(task);
    }

    protected keepClaim(runId: string): { stop(): void } {
        const {
            store,
            clock,
            owner,
            claimTtlMs,
        } = this.opts;
        let stopped = false;
        let timer: { clear(): void } | undefined;
        const schedule = () => {
            timer = clock.setTimeout(() => {
                store.renewClaim(runId, owner, claimTtlMs)
                    .catch(() => false)
                    .then((ok) => {
                        if (ok && !stopped) schedule();
                    });
            }, Math.max(1, Math.floor(claimTtlMs / 3)));
        };
        schedule();
        return {
            stop: () => {
                stopped = true;
                timer?.clear();
            },
        };
    }
}
