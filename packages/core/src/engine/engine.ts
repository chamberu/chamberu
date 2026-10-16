import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { pid } from 'node:process';
import { systemClock } from '../clock.ts';
import type { Clock } from '../clock.ts';
import type { Agent } from '../agent/types.ts';
import { createResumeToken, verifyResumeToken } from '../approval/token.ts';
import {
    InvalidAgentDefinitionError,
    InvalidResumeTokenError,
    InvalidRunStateError,
    RunNotFoundError,
} from '../errors.ts';
import type { Notifier } from '../notify/types.ts';
import type {
    Run,
    Step,
    Usage,
    WaitPoint,
} from '../run/types.ts';
import type { Store } from '../store/types.ts';
import type { TriggerEnvelope } from '../trigger/types.ts';
import { executeRun, toRunError } from './execute.ts';
import type { ApprovalRequest } from './execute.ts';
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

export interface ResumeDecision {
    approved: boolean;
    reason?: string;
}

const IDEMPOTENCY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_APPROVAL_TIMEOUT_MS = 24 * 60 * 60 * 1000;
const APPROVAL_TIMED_OUT = 'approval timed out';

export class RunEngine {
    protected readonly store: Store;

    protected readonly agents: Map<string, Agent>;

    protected readonly notifiers: Record<string, Notifier>;

    protected readonly owner: string;

    protected readonly clock: Clock;

    protected readonly resumeSecret: string;

    protected readonly queue: RunQueue;

    protected readonly claimTtlMs: number;

    protected readonly listeners = new Set<(e: RunEvent) => void>();

    protected readonly onError: (error: unknown, run?: Run) => void;

    /** Runs executing in this process, by id. */
    protected readonly executions = new Map<string, { controller: AbortController; done: Promise<void> }>();

    protected started = false;

    protected lastCreatedAt = 0;

    constructor(opts: RunEngineOptions) {
        this.store = opts.store;
        this.agents = new Map(opts.agents.map((a) => [a.name, a]));
        this.notifiers = opts.notifiers ?? {};
        this.owner = opts.owner ?? `${hostname()}-${pid}`;
        this.clock = opts.clock ?? systemClock;
        this.resumeSecret = opts.resumeSecret;
        this.claimTtlMs = opts.claimTtlMs ?? 60_000;
        for (const agent of opts.agents) {
            const { notify } = agent.definition;
            if (notify !== undefined && !this.notifiers[notify]) {
                throw new InvalidAgentDefinitionError(`Agent "${agent.name}" uses unknown notifier "${notify}".`);
            }
        }
        // eslint-disable-next-line no-console
        this.onError = opts.onError ?? ((error) => console.error('[chamberu]', error));
        this.queue = new RunQueue({
            store: this.store,
            clock: this.clock,
            owner: this.owner,
            maxConcurrentRuns: opts.maxConcurrentRuns ?? 4,
            claimTtlMs: this.claimTtlMs,
            execute: (run) => this.guardedExecute(run),
            onError: (error, run) => this.onError(error, run),
            onRunUpdated: (run) => this.emit({ type: 'run.updated', run }),
            onPoll: () => this.tick(),
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
     * Cancels a run: aborts it when it executes in this process (resolving once
     * it settled), or marks a queued or waiting run cancelled.
     */
    async cancel(runId: string): Promise<void> {
        const execution = this.executions.get(runId);
        if (execution) {
            execution.controller.abort();
            await execution.done;
            return;
        }
        const run = await this.store.getRun(runId);
        if (!run) throw new RunNotFoundError(runId);
        if (run.status !== 'queued' && run.status !== 'waiting') {
            throw new InvalidRunStateError(`Run "${runId}" is ${run.status} and not executing here; it cannot be cancelled.`);
        }
        const now = this.clock.now();
        const updated = await this.store.updateRun(
            runId,
            {
                status: 'cancelled',
                waiting: undefined,
                finishedAt: now,
                updatedAt: now,
            },
            { expectStatus: ['queued', 'waiting'] },
        );
        this.emit({ type: 'run.updated', run: updated });
    }

    /**
     * Answers the approval a `waiting` run waits on and requeues it. Single
     * use: a second resume of the same wait point throws InvalidRunStateError.
     * Throws InvalidResumeTokenError for a forged, expired or superseded token.
     */
    async resume(token: string, decision: ResumeDecision): Promise<void> {
        const claims = verifyResumeToken(this.resumeSecret, token, this.clock.now());
        const run = await this.store.getRun(claims.runId);
        if (!run) throw new RunNotFoundError(claims.runId);
        if (run.status !== 'waiting' || !run.waiting) {
            throw new InvalidRunStateError(`Run "${run.id}" is ${run.status} and not waiting for an approval.`);
        }
        if (run.waiting.tokenId !== claims.tokenId || run.waiting.approvalId !== claims.approvalId) {
            throw new InvalidResumeTokenError('The resume token does not belong to the current approval.');
        }
        await this.answer(run, run.waiting, decision);
    }

    /** Denies every approval past its expiresAt ('approval timed out'). Also runs on every poll. */
    async tick(): Promise<void> {
        const now = this.clock.now().getTime();
        const { data } = await this.store.listRuns({ status: ['waiting'] });
        for (const listed of data) {
            if (!listed.waiting || listed.waiting.expiresAt.getTime() > now) continue;
            try {
                // the listing may be stale by now: the run could wait on a newer approval
                const run = await this.store.getRun(listed.id);
                if (run?.status !== 'waiting' || !run.waiting || run.waiting.expiresAt.getTime() > now) continue;
                await this.answer(run, run.waiting, { approved: false, reason: APPROVAL_TIMED_OUT });
            } catch (error) {
                // answered meanwhile (resume, another replica)
                if (!(error instanceof InvalidRunStateError) && !(error instanceof InvalidResumeTokenError)) {
                    this.onError(error, listed);
                }
            }
        }
    }

    /**
     * waiting → queued, then the approval response is checkpointed. The
     * transition comes first and is guarded by expectStatus, so only one answer
     * ever writes; the run stays claimed by us until the checkpoint landed, so no
     * pass executes it from the unanswered checkpoint.
     *
     * `waiting` survives the transition and is cleared only after the response
     * landed: if we die in between, the run re-pauses on the same wait point, so
     * the token the owner already holds stays valid.
     */
    protected async answer(run: Run, waiting: WaitPoint, decision: ResumeDecision): Promise<void> {
        const now = this.clock.now();
        const transitioned = await this.store.updateRun(run.id, {
            status: 'queued',
            claim: { owner: this.owner, expiresAt: new Date(now.getTime() + this.claimTtlMs) },
            updatedAt: now,
        }, { expectStatus: ['waiting'] });

        let queued: Run;
        try {
            // the run may have moved on to another approval since `waiting` was read
            if (transitioned.waiting?.tokenId !== waiting.tokenId) {
                throw new InvalidResumeTokenError('The resume token does not belong to the current approval.');
            }
            const checkpoint = await this.store.latestCheckpoint(run.id);
            if (!checkpoint) throw new InvalidRunStateError(`Run "${run.id}" has no checkpoint to resume from.`);
            await this.store.saveCheckpoint({
                ...checkpoint,
                messages: [
                    ...checkpoint.messages,
                    {
                        role: 'tool',
                        content: [{
                            type: 'tool-approval-response',
                            approvalId: waiting.approvalId,
                            approved: decision.approved,
                            reason: decision.reason,
                        }],
                    },
                ],
                createdAt: now,
            });
            const step: Step = {
                runId: run.id,
                index: (await this.store.listSteps(run.id)).length,
                kind: 'wait',
                name: waiting.toolName,
                input: waiting.input,
                output: {
                    approvalId: waiting.approvalId,
                    approved: decision.approved,
                    reason: decision.reason,
                },
                startedAt: run.updatedAt,
                finishedAt: now,
            };
            await this.store.appendStep(step);
            this.emit({ type: 'step.appended', step });
            queued = await this.store.updateRun(run.id, {
                waiting: undefined,
                claim: undefined,
                updatedAt: this.clock.now(),
            }, { expectStatus: ['queued'] });
        } catch (error) {
            // undo, so the wait point (still on the run) and its token stay answerable
            await this.store.updateRun(run.id, {
                status: 'waiting',
                claim: undefined,
                updatedAt: this.clock.now(),
            }, { expectStatus: ['queued'] }).catch((undoError: unknown) => this.onError(undoError, run));
            throw error;
        }
        this.emit({ type: 'run.updated', run: queued });
        if (this.started) void this.queue.pump();
    }

    /**
     * running → waiting on `request`, releasing claim and slot (a keyed run keeps
     * its key blocked while waiting). Re-pausing on the same approval keeps the
     * wait point, so tokens sent earlier stay valid; the owner is notified once.
     */
    protected async pause(run: Run, agent: Agent, request: ApprovalRequest, usage: Usage): Promise<void> {
        const now = this.clock.now();
        const waiting: WaitPoint = run.waiting?.approvalId === request.approvalId ?
            run.waiting :
            {
                kind: 'approval',
                ...request,
                expiresAt: new Date(now.getTime() + (agent.definition.approvalTimeoutMs ?? DEFAULT_APPROVAL_TIMEOUT_MS)),
                tokenId: randomUUID(),
            };
        const updated = await this.store.updateRun(run.id, {
            status: 'waiting',
            waiting,
            usage,
            claim: undefined,
            updatedAt: now,
        }, { expectStatus: ['running'] });
        this.emit({ type: 'run.updated', run: updated });
        await this.notifyApproval(updated, agent, waiting);
    }

    /**
     * Once per approval after a successful send (deduped by a store lock held
     * for the idempotency TTL). A failed send releases the lock, so the next
     * re-pause retries; failures go to onError, the run keeps waiting.
     */
    protected async notifyApproval(run: Run, agent: Agent, waiting: WaitPoint): Promise<void> {
        const name = agent.definition.notify;
        const notifier = name === undefined ? undefined : this.notifiers[name];
        if (!notifier) return;
        const idempotencyKey = `${run.id}:${waiting.approvalId}`;
        const lockKey = `notify:${idempotencyKey}`;
        const attempt = randomUUID();
        let acquired = false;
        try {
            acquired = await this.store.acquire(lockKey, attempt, IDEMPOTENCY_TTL_MS);
            if (!acquired) return;
            await notifier.notify({
                kind: 'approval',
                agent: run.agent,
                runId: run.id,
                title: `Approval required: ${waiting.toolName}`,
                body: `Agent "${run.agent}" wants to call "${waiting.toolName}" with:\n${JSON.stringify(waiting.input, null, 2)}`,
                resumeToken: createResumeToken(this.resumeSecret, {
                    runId: run.id,
                    approvalId: waiting.approvalId,
                    tokenId: waiting.tokenId,
                    expiresAt: waiting.expiresAt,
                }),
                expiresAt: waiting.expiresAt,
            }, { idempotencyKey });
        } catch (error) {
            this.onError(error, run);
            if (acquired) {
                await this.store.release(lockKey, attempt).catch((releaseError: unknown) => this.onError(releaseError, run));
            }
        }
    }

    /**
     * The single execution seam: runs one claimed, `running` run to a settled
     * state. `signal` aborts on cancel.
     */
    protected async execute(run: Run, signal: AbortSignal): Promise<void> {
        const agent = this.agents.get(run.agent);
        if (!agent) throw new InvalidAgentDefinitionError(`unknown agent: ${run.agent}`);
        await executeRun({
            run,
            agent,
            store: this.store,
            clock: this.clock,
            signal,
            finish: (patch) => this.finish(run.id, patch),
            update: async (patch) => {
                const updated = await this.store.updateRun(run.id, patch, { expectStatus: ['running'] });
                this.emit({ type: 'run.updated', run: updated });
                return updated;
            },
            onStepAppended: (step) => this.emit({ type: 'step.appended', step }),
            pause: (request, usage) => this.pause(run, agent, request, usage),
            toolApprovalSecret: this.resumeSecret,
        });
    }

    /** A throwing execution fails the run (and releases its claim) instead of leaking. */
    protected guardedExecute(run: Run): Promise<void> {
        const controller = new AbortController();
        const done = (async () => {
            try {
                await this.execute(run, controller.signal);
            } catch (error) {
                await this.finish(run.id, { status: 'failed', error: toRunError(error) });
                this.onError(error, run);
            } finally {
                this.executions.delete(run.id);
            }
        })();
        this.executions.set(run.id, { controller, done: done.catch(() => {}) });
        return done;
    }

    protected async finish(id: string, patch: Partial<Run>): Promise<Run> {
        const now = this.clock.now();
        const updated = await this.store.updateRun(
            id,
            {
                claim: undefined,
                // a run resumed after a crash may still carry its answered wait point
                waiting: undefined,
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
