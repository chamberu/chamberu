import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { pid } from 'node:process';
import { systemClock } from '../clock.ts';
import type { Clock } from '../clock.ts';
import type { Agent } from '../agent/types.ts';
import { InvalidAgentDefinitionError } from '../errors.ts';
import type { Notifier } from '../notify/types.ts';
import type { Run, Step } from '../run/types.ts';
import type { Store } from '../store/types.ts';
import type { TriggerEnvelope } from '../trigger/types.ts';
import { RunQueue } from './queue.ts';

export type RunEvent = { type: 'run.updated'; run: Run } | { type: 'step.appended'; step: Step };

export interface RunEngineOptions {
    store: Store;
    agents: Agent[];
    notifiers?: Record<string, Notifier>;
    /** Default `${hostname}-${pid}`. */
    owner?: string;
    /** Default 4. */
    maxConcurrentRuns?: number;
    /** Default 60_000, renewed every ttl/3 while running. */
    claimTtlMs?: number;
    /** HMAC secret for resume tokens. */
    resumeSecret: string;
    clock?: Clock;
    /** Receives errors that have no caller to throw to. Default console.error. */
    onError?: (error: unknown, run?: Run) => void;
}

export type DispatchEnvelope = Omit<TriggerEnvelope, 'id' | 'receivedAt'> & Partial<Pick<TriggerEnvelope, 'id' | 'receivedAt'>>;

const IDEMPOTENCY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export class RunEngine {
    protected readonly store: Store;

    protected readonly agents: Map<string, Agent>;

    protected readonly notifiers: Record<string, Notifier>;

    protected readonly owner: string;

    protected readonly clock: Clock;

    protected readonly resumeSecret: string;

    protected readonly queue: RunQueue;

    protected readonly listeners = new Set<(e: RunEvent) => void>();

    protected readonly onError: (error: unknown, run?: Run) => void;

    protected started = false;

    protected lastCreatedAt = 0;

    constructor(opts: RunEngineOptions) {
        this.store = opts.store;
        this.agents = new Map(opts.agents.map((a) => [a.name, a]));
        this.notifiers = opts.notifiers ?? {};
        this.owner = opts.owner ?? `${hostname()}-${pid}`;
        this.clock = opts.clock ?? systemClock;
        this.resumeSecret = opts.resumeSecret;
        // eslint-disable-next-line no-console
        this.onError = opts.onError ?? ((error) => console.error('[chamberu]', error));
        this.queue = new RunQueue({
            store: this.store,
            clock: this.clock,
            owner: this.owner,
            maxConcurrentRuns: opts.maxConcurrentRuns ?? 4,
            claimTtlMs: opts.claimTtlMs ?? 60_000,
            execute: (run) => this.guardedExecute(run),
            onError: (error, run) => this.onError(error, run),
            onRunUpdated: (run) => this.emit({ type: 'run.updated', run }),
        });
    }

    async dispatch(envelope: DispatchEnvelope): Promise<{ runId: string; deduplicated: boolean }> {
        if (!this.agents.has(envelope.agent)) {
            throw new InvalidAgentDefinitionError(`unknown agent: ${envelope.agent}`);
        }
        const now = this.nextCreatedAt();
        const trigger: TriggerEnvelope = {
            ...envelope,
            id: envelope.id ?? randomUUID(),
            receivedAt: envelope.receivedAt ?? now,
        };
        const runId = randomUUID();

        if (trigger.idempotencyKey !== undefined) {
            const claimed = await this.store.claimKey(
                `${trigger.agent}:${trigger.source}`,
                trigger.idempotencyKey,
                runId,
                IDEMPOTENCY_TTL_MS,
            );
            if (!claimed.created) return { runId: claimed.runId, deduplicated: true };
        }

        const run: Run = {
            id: runId,
            agent: trigger.agent,
            status: 'queued',
            trigger,
            concurrencyKey: trigger.concurrencyKey,
            thread: trigger.thread,
            usage: { inputTokens: 0, outputTokens: 0 },
            createdAt: now,
            updatedAt: now,
        };
        await this.store.createRun(run);
        this.emit({ type: 'run.updated', run });
        if (this.started) void this.queue.pump();
        return { runId, deduplicated: false };
    }

    getRun(id: string): Promise<Run | undefined> {
        return this.store.getRun(id);
    }

    on(event: RunEvent['type'], listener: (e: RunEvent) => void): () => void {
        const wrapped = (e: RunEvent) => {
            if (e.type === event) listener(e);
        };
        this.listeners.add(wrapped);
        return () => {
            this.listeners.delete(wrapped);
        };
    }

    async start(): Promise<void> {
        this.started = true;
        this.queue.startPolling();
        await this.queue.pump();
    }

    /** Stops the poll for newly runnable work only; dispatch and running runs are unaffected. */
    stop(): void {
        this.started = false;
        this.queue.stopPolling();
    }

    idle(): Promise<void> {
        return this.queue.idle();
    }

    /**
     * The single execution seam: runs one claimed, `running` run to a settled
     * state. Stub for now; replaced by real AI SDK runs.
     */
    protected async execute(run: Run): Promise<void> {
        await this.finish(run.id, { status: 'completed' });
    }

    /** A throwing execution fails the run (and releases its claim) instead of leaking. */
    protected async guardedExecute(run: Run): Promise<void> {
        try {
            await this.execute(run);
        } catch (error) {
            const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
            await this.finish(run.id, {
                status: 'failed',
                error: {
                    code: typeof code === 'string' ? code : 'Error',
                    message: error instanceof Error ? error.message : String(error),
                },
            });
            this.onError(error, run);
        }
    }

    protected async finish(id: string, patch: Partial<Run>): Promise<Run> {
        const now = this.clock.now();
        const updated = await this.store.updateRun(
            id,
            {
                claim: undefined,
                finishedAt: now,
                updatedAt: now,
                ...patch,
            },
            { expectStatus: ['running'] },
        );
        this.emit({ type: 'run.updated', run: updated });
        return updated;
    }

    protected emit(event: RunEvent): void {
        for (const listener of this.listeners) {
            try {
                listener(event);
            } catch (error) {
                this.onError(error);
            }
        }
    }

    /** Strictly increasing per process, so FIFO order survives identical clock readings. */
    protected nextCreatedAt(): Date {
        const t = Math.max(this.clock.now().getTime(), this.lastCreatedAt + 1);
        this.lastCreatedAt = t;
        return new Date(t);
    }
}
