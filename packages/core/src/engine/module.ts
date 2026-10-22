/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { pid } from 'node:process';
import type { Agent } from '../agent/types.ts';
import { createResumeToken, verifyResumeToken } from '../approval/module.ts';
import { assertArtifactInput } from '../artifact/helpers.ts';
import { attachmentIds, storeArtifact } from '../artifact/module.ts';
import { assertChannelName, createChannelContext } from '../channel/helpers.ts';
import type { IChannel } from '../channel/types.ts';
import type { ResumeTokenClaims } from '../approval/types.ts';
import { systemClock } from '../clock/index.ts';
import type { IClock } from '../clock/index.ts';
import { contextKeyName, isContextKey } from '../context/helpers.ts';
import type { ContextKey, IContextProvider } from '../context/types.ts';
import {
    AgentNotFoundError,
    InvalidAgentDefinitionError,
    InvalidResumeTokenError,
    InvalidRunStateError,
    LeaseLostError,
    RunNotFoundError,
    ValidationError,
} from '../errors/index.ts';
import type { INotifier } from '../notify/types.ts';
import { RunStatus } from '../run/constants.ts';
import type {
    Run,
    Step,
    Usage,
    WaitPoint,
} from '../run/types.ts';
import type { IStore } from '../store/types.ts';
import { idempotencyScope, toInvoker } from '../trigger/helpers.ts';
import { assertTriggerKey } from '../trigger/key.ts';
import type { TriggerEnvelope } from '../trigger/types.ts';
import {
    APPROVAL_TIMED_OUT,
    DEFAULT_APPROVAL_TIMEOUT_MS,
    DEFAULT_DRAIN_TIMEOUT_MS,
    IDEMPOTENCY_TTL_MS,
} from './constants.ts';
import { toRunError } from './execute/helpers.ts';
import { executeRun } from './execute/module.ts';
import { staleToken } from './helpers.ts';
import type { ApprovalRequest } from './execute/types.ts';
import { RunQueue } from './queue/module.ts';
import { cancelAgentRuns, dropRevision, syncRevision } from './registry/module.ts';
import type { RegistryContext } from './registry/types.ts';
import type {
    ApprovalAnswer,
    DispatchEnvelope,
    EngineEvent,
    EngineOptions,
    EngineStartOptions,
    ResumeDecision,
} from './types.ts';

export class Engine implements IContextProvider {
    /** The store runs, steps and state live in; packages built on the engine read through it. */
    readonly store: IStore;

    protected readonly agents: Map<string, Agent>;

    /** The revision each registered agent was loaded at; undefined for a code agent. */
    protected readonly revisions = new Map<string, string | undefined>();

    /** Agents whose revision marker this engine is moving: none of their runs starts here meanwhile. */
    protected readonly syncing = new Set<string>();

    /** Agents removed here whose store cleanup is still to finish, with the revision they had. */
    protected readonly removals = new Map<string, string | undefined>();

    protected readonly notifiers: Record<string, INotifier>;

    /** The registered channels by name, in registration order. */
    protected readonly channels: Map<string, IChannel<any, any>>;

    /** Channels started by the last start(), until a drain() or stop() stops them. */
    protected startedChannels: IChannel<any, any>[] = [];

    /** The stop of the channels started last, shared by drain() and stop(). */
    protected stoppingChannels: Promise<void> | undefined;

    protected readonly owner: string;

    /** Every time-based decision of the engine; packages built on it share it. */
    readonly clock: IClock;

    protected readonly resumeSecret: string;

    protected readonly queue: RunQueue;

    protected readonly claimTtlMs: number;

    protected readonly listeners = new Set<(e: EngineEvent) => void>();

    protected readonly onError: (error: unknown, run?: Run) => void;

    /**
     * Runs executing in this process, by id. `stop` says why the execution was
     * aborted: cancel settles it `cancelled`, drain `interrupted`, and after a
     * lost lease it writes nothing at all.
     */
    protected readonly executions = new Map<string, {
        controller: AbortController;
        done: Promise<void>;
        stop?: 'cancel' | 'drain' | 'lease-lost';
    }>();

    protected started = false;

    protected draining = false;

    protected lastCreatedAt = 0;

    /** Values tools reach through inject(ctx, key), by reference. */
    protected readonly provided = new Map<ContextKey<unknown>, unknown>();

    constructor(opts: EngineOptions) {
        this.store = opts.store;
        this.agents = new Map(opts.agents.map((a) => [a.name, a]));
        this.notifiers = opts.notifiers ?? {};
        const channels = opts.channels ?? [];
        this.channels = new Map();
        for (const channel of channels) {
            assertChannelName(channel.name);
            if (this.channels.has(channel.name)) {
                throw new InvalidAgentDefinitionError(`The channel "${channel.name}" is registered more than once.`);
            }
            this.channels.set(channel.name, channel);
        }
        this.owner = opts.owner ?? `${hostname()}-${pid}`;
        this.clock = opts.clock ?? systemClock;
        this.resumeSecret = opts.resumeSecret;
        this.claimTtlMs = opts.claimTtlMs ?? 60_000;
        if (!this.resumeSecret) {
            // an empty HMAC key would let anyone mint valid resume tokens
            throw new InvalidAgentDefinitionError('The engine needs a non-empty resumeSecret.');
        }
        if (this.agents.size !== opts.agents.length) {
            const seen = new Set<string>();
            const duplicate = opts.agents.find((a) => seen.size === seen.add(a.name).size);
            throw new InvalidAgentDefinitionError(`Agent name "${duplicate?.name}" is used more than once.`);
        }
        for (const agent of opts.agents) this.assertRegistrable(agent);
        // eslint-disable-next-line no-console
        this.onError = opts.onError ?? ((error) => console.error('[chamvi]', error));
        this.queue = new RunQueue({
            store: this.store,
            clock: this.clock,
            owner: this.owner,
            maxConcurrentRuns: opts.maxConcurrentRuns ?? 4,
            claimTtlMs: this.claimTtlMs,
            execute: (run) => this.guardedExecute(run),
            onError: (error, run) => this.onError(error, run),
            onRunUpdated: (run) => this.emit({ type: 'run.updated', run }),
            onPoll: async () => {
                await this.tick();
                await this.recover();
            },
            onLeaseLost: (runId) => this.loseLease(runId),
            prepareStart: () => this.prepareStart(),
        });
    }

    async dispatch(envelope: DispatchEnvelope): Promise<{ runId: string; deduplicated: boolean }> {
        if (!this.agents.has(envelope.agent)) throw new AgentNotFoundError(envelope.agent);
        const {
            attachments, 
            invoker, 
            ...rest 
        } = envelope;
        // before any store write: an invalid attachment stores nothing
        if (attachments !== undefined && !Array.isArray(attachments)) {
            throw new ValidationError('The attachments must be an array.');
        }
        attachments?.forEach((attachment, i) => assertArtifactInput(attachment, `attachment ${i}`));
        assertTriggerKey('idempotency key', envelope.idempotencyKey);
        assertTriggerKey('concurrency key', envelope.concurrencyKey);
        assertTriggerKey('address', envelope.address);
        const snapshot = invoker !== undefined ? toInvoker(invoker) : undefined;
        const now = this.nextCreatedAt();
        const trigger: TriggerEnvelope = {
            ...rest,
            ...(snapshot ? { invoker: snapshot } : {}),
            id: envelope.id ?? randomUUID(),
            receivedAt: envelope.receivedAt ?? now,
        };
        let runId: string = randomUUID();

        if (trigger.idempotencyKey !== undefined) {
            const claimed = await this.store.claimKey(
                idempotencyScope(trigger),
                trigger.idempotencyKey,
                runId,
                IDEMPOTENCY_TTL_MS,
            );
            if (!claimed.created) {
                if (await this.store.getRun(claimed.runId)) return { runId: claimed.runId, deduplicated: true };
                // the key's run was never created (createRun failed after the claim, or is
                // still in flight): create it under the reserved id; createRun decides the race
                runId = claimed.runId;
            }
        }

        if (attachments?.length) {
            // stored before the run, so an executing run finds them; a crash in between leaves orphans.
            // Ids derive from the run id: a concurrent healer of the same run writes no-ops.
            const ids = attachmentIds(runId, attachments.length);
            trigger.attachments = [];
            for (const [i, attachment] of attachments.entries()) {
                trigger.attachments.push(await storeArtifact(this.store, { id: runId, agent: trigger.agent }, attachment, now, ids[i]));
            }
        }

        const run: Run = {
            id: runId,
            agent: trigger.agent,
            status: RunStatus.QUEUED,
            trigger,
            concurrencyKey: trigger.concurrencyKey,
            address: trigger.address,
            usage: { inputTokens: 0, outputTokens: 0 },
            createdAt: now,
            updatedAt: now,
        };
        if (!await this.store.createRun(run)) return { runId, deduplicated: true };
        this.emit({ type: 'run.updated', run });
        if (this.started) void this.queue.pump();
        return { runId, deduplicated: false };
    }

    /**
     * Provides `value` (by reference, never cloned, stored or serialized) to
     * every execution's tools, tools factory and effect hooks through
     * inject(ctx, key); also after start(). Refuses a key not made by this
     * copy's defineContextKey(), `undefined` and a second value for one key.
     */
    provide<T>(key: ContextKey<T>, value: T): void {
        const name = contextKeyName(key);
        if (!isContextKey(key)) {
            throw new InvalidAgentDefinitionError(
                `Context "${name}" has no key from defineContextKey() of the engine's @chamvi/core: ` +
                'a key from another copy of @chamvi/core (a package that resolved its own) is refused.',
            );
        }
        if (value === undefined) throw new InvalidAgentDefinitionError(`Context "${name}" needs a value.`);
        if (this.provided.has(key)) throw new InvalidAgentDefinitionError(`Context "${name}" is already provided.`);
        this.provided.set(key, value);
    }

    /** The registered agent of that name. */
    getAgent(name: string): Agent | undefined {
        return this.agents.get(name);
    }

    /** The registered agents in registration order, as a new array. */
    listAgents(): Agent[] {
        return this.agents.values().toArray();
    }

    /** The registered channel of that name. */
    getChannel(name: string): IChannel | undefined {
        return this.channels.get(name);
    }

    /** The registered channels in registration order, as a new array. */
    listChannels(): IChannel[] {
        return Array.from(this.channels.values());
    }

    /** The revision the registered agent was loaded at (undefined for a code agent). */
    agentRevision(name: string): string | undefined {
        return this.revisions.get(name);
    }

    /**
     * Registers an agent, or replaces the one of the same name in place (a new
     * one goes last). With a `revision` (a folder agent's content hash) the
     * store's revision marker is brought to it under the lock `agents:<name>`:
     * a changed marker cancels the agent's unsettled runs created before the
     * change, once across replicas. Without one, replacing a registered agent
     * cancels its unsettled runs created before now. Emits `agents.changed`,
     * except for the same agent at the same revision (`unchanged`).
     */
    async putAgent(agent: Agent, options: { revision?: string } = {}): Promise<'added' | 'replaced' | 'unchanged'> {
        this.assertRegistrable(agent);
        const { name } = agent;
        const { revision } = options;
        const registered = this.agents.has(name);
        if (registered && this.agents.get(name) === agent && this.revisions.get(name) === revision) return 'unchanged';
        if (revision !== undefined) {
            this.syncing.add(name);
            try {
                await syncRevision(this.registry(), name, revision);
            } finally {
                this.syncing.delete(name);
            }
        } else if (registered) {
            await cancelAgentRuns(this.registry(), name, this.clock.now());
        }
        const kind = this.agents.has(name) ? 'replaced' : 'added';
        this.agents.set(name, agent);
        this.revisions.set(name, revision);
        this.emit({
            type: 'agents.changed', 
            name, 
            kind, 
        });
        return kind;
    }

    /**
     * Removes an agent: first from this engine (no further dispatch, emits
     * `agents.changed`), then from the store's view under the lock
     * `agents:<name>`: with a stored revision marker (also one this engine
     * never loaded) all its unsettled runs are cancelled and the marker
     * deleted, unless this engine had the agent at another revision (a newer
     * one registered elsewhere); without a marker, the runs of an agent
     * registered here are cancelled. Resolves whether it was registered here.
     */
    async removeAgent(name: string): Promise<boolean> {
        const registered = this.agents.has(name);
        if (registered) {
            this.removals.set(name, this.revisions.get(name));
            this.agents.delete(name);
            this.revisions.delete(name);
            this.emit({
                type: 'agents.changed',
                name,
                kind: 'removed',
            });
        }
        const pending = this.removals.has(name);
        await dropRevision(this.registry(), name, {
            registered: pending,
            ...(pending && { revision: this.removals.get(name) }),
        });
        this.removals.delete(name);
        return registered;
    }

    getRun(id: string): Promise<Run | undefined> {
        return this.store.getRun(id);
    }

    on<T extends EngineEvent['type']>(event: T, listener: (e: Extract<EngineEvent, { type: T }>) => void): () => void {
        const wrapped = (e: EngineEvent) => {
            if (e.type === event) listener(e as Extract<EngineEvent, { type: T }>);
        };
        this.listeners.add(wrapped);
        return () => {
            this.listeners.delete(wrapped);
        };
    }

    /** True from drain() until the next start(). */
    get isDraining(): boolean {
        return this.draining;
    }

    /**
     * Recovers abandoned runs, starts every channel (in registration order,
     * unless `channels: false`), then starts executing queued runs and
     * polling. A throwing channel start rejects after the channels already
     * started were stopped and polling stopped.
     */
    async start(options: EngineStartOptions = {}): Promise<void> {
        this.draining = false;
        this.started = true;
        this.queue.resume();
        this.queue.startPolling();
        // like a failing pass, a failing recovery is reported; the next poll retries it
        await this.recover().catch((error: unknown) => this.onError(error));
        if (options.channels ?? true) await this.startChannels();
        await this.queue.pump();
    }

    /**
     * Stops the channels started last (their stop errors go to onError) and
     * the poll for newly runnable work; dispatch and running runs are
     * unaffected.
     */
    stop(): void {
        void this.stopChannels();
        this.started = false;
        this.queue.stopPolling();
    }

    protected async startChannels(): Promise<void> {
        // a channel left over from an earlier start must stop before it starts again
        await this.stopChannels();
        for (const channel of this.channels.values()) {
            if (!channel.start) continue;
            try {
                await channel.start(createChannelContext(this, channel));
            } catch (error) {
                this.stop();
                await this.stopChannels();
                throw error;
            }
            this.startedChannels.push(channel);
        }
    }

    /** Stops every started channel once, concurrently; a rejection goes to onError. */
    protected stopChannels(): Promise<void> {
        if (this.startedChannels.length > 0) {
            const channels = this.startedChannels;
            this.startedChannels = [];
            const previous = this.stoppingChannels ?? Promise.resolve();
            this.stoppingChannels = previous.then(async () => {
                const results = await Promise.allSettled(channels.map((channel) => channel.stop?.()));
                for (const result of results) {
                    if (result.status === 'rejected') this.onError(result.reason);
                }
            });
        }
        return this.stoppingChannels ?? Promise.resolve();
    }

    /**
     * Requeues every `running` or `interrupted` run whose claim expired (or was
     * released), so its next execution resumes from the latest checkpoint.
     * Runs executing here and runs with a live claim are left alone. Also runs
     * on every poll. Resolves the number of runs requeued.
     */
    async recover(): Promise<number> {
        const { data } = await this.store.listRuns({ status: [RunStatus.RUNNING, RunStatus.INTERRUPTED] });
        let requeued = 0;
        for (const run of data) {
            const execution = this.executions.get(run.id);
            if (execution) {
                // cancel() was called on a replica that does not execute the run
                if (run.cancelRequested) {
                    execution.stop ??= 'cancel';
                    execution.controller.abort();
                }
                continue;
            }
            try {
                // atomic: fails while another owner's claim is live
                if (!await this.store.claimRun(run.id, this.owner, this.claimTtlMs)) continue;
            } catch (error) {
                this.onError(error, run);
                continue;
            }
            try {
                const queued = await this.store.updateRun(run.id, {
                    status: RunStatus.QUEUED,
                    claim: undefined,
                    updatedAt: this.clock.now(),
                }, { expectStatus: [RunStatus.RUNNING, RunStatus.INTERRUPTED], expectOwner: this.owner });
                requeued++;
                this.emit({ type: 'run.updated', run: queued });
            } catch (error) {
                // the run settled since it was listed: drop the claim just taken
                await this.store.updateRun(run.id, { claim: undefined }, { expectOwner: this.owner })
                    .catch(() => {});
                if (!(error instanceof InvalidRunStateError)) this.onError(error, run);
            }
        }
        if (requeued > 0 && this.started) void this.queue.pump();
        return requeued;
    }

    /**
     * Graceful shutdown: stops starting runs (dispatch still stores them
     * `queued`, for another replica), polling and tick; waits up to `timeoutMs`
     * (default 30 000) for in-flight runs, then aborts the rest and marks them
     * `interrupted` with their claim released.
     */
    async drain(opts: { timeoutMs?: number } = {}): Promise<void> {
        this.draining = true;
        this.stop();
        // no new inbound before the wait
        await this.stopChannels();
        await this.queue.halt();

        let timer: { clear(): void } | undefined;
        const timedOut = new Promise<true>((resolve) => {
            // keepAlive: the process must not exit before the leftovers are marked interrupted
            timer = this.clock.setTimeout(() => resolve(true), opts.timeoutMs ?? DEFAULT_DRAIN_TIMEOUT_MS, { keepAlive: true });
        });
        const settled = await Promise.race([this.queue.idle().then(() => false as const), timedOut]);
        timer?.clear();
        if (!settled) return;

        while (this.executions.size > 0) {
            const pending = this.executions.values().toArray();
            for (const execution of pending) {
                execution.stop ??= 'drain';
                execution.controller.abort();
            }
            await Promise.all(pending.map((execution) => execution.done));
        }
        await this.queue.idle();
    }

    idle(): Promise<void> {
        return this.queue.idle();
    }

    /**
     * Cancels a run: aborts it when it executes in this process (resolving once
     * it settled), or marks a queued or waiting run cancelled. A run `running`
     * on another replica (or `interrupted`) gets `cancelRequested`: its owner
     * aborts it on the next poll (within claimTtlMs / 3), and a recovered
     * execution settles it cancelled without a model call. Throws
     * InvalidRunStateError for a settled run, and when the local execution lost
     * its lease meanwhile: the run was not cancelled and may execute on another
     * owner now.
     */
    async cancel(runId: string): Promise<void> {
        const execution = this.executions.get(runId);
        if (execution) {
            execution.stop ??= 'cancel';
            execution.controller.abort();
            await execution.done;
            if (execution.stop === 'lease-lost') {
                throw new InvalidRunStateError(`Run "${runId}" lost its claim while being cancelled; it is no longer executing here.`);
            }
            // the abort cannot stop a pause that was already writing: cancel the run it left waiting
            const run = await this.store.getRun(runId);
            if (run?.status === RunStatus.WAITING || run?.status === RunStatus.QUEUED) await this.cancelStored(runId, [run.status]);
            return;
        }
        for (let attempt = 0; ; attempt++) {
            const run = await this.store.getRun(runId);
            if (!run) throw new RunNotFoundError(runId);

            const { status } = run;
            if (status !== RunStatus.QUEUED && status !== RunStatus.WAITING && status !== RunStatus.RUNNING && status !== RunStatus.INTERRUPTED) {
                throw new InvalidRunStateError(`Run "${runId}" is ${status}; it cannot be cancelled.`);
            }
            try {
                if (status === RunStatus.QUEUED || status === RunStatus.WAITING) {
                    await this.cancelStored(runId, [status]);
                } else {
                    const updated = await this.store.updateRun(runId, {
                        cancelRequested: true,
                        updatedAt: this.clock.now(),
                    }, { expectStatus: [status] });
                    this.emit({ type: 'run.updated', run: updated });
                }
                return;
            } catch (error) {
                // the run moved on since it was read (started, paused, settled): decide again
                if (!(error instanceof InvalidRunStateError) || attempt >= 2) throw error;
            }
        }
    }

    /** Settles a run nobody executes (`expectStatus`) as cancelled. */
    protected async cancelStored(runId: string, expectStatus: Run['status'][]): Promise<void> {
        const now = this.clock.now();
        const updated = await this.store.updateRun(
            runId,
            {
                status: RunStatus.CANCELLED,
                waiting: undefined,
                finishedAt: now,
                updatedAt: now,
            },
            { expectStatus },
        );
        this.emit({ type: 'run.updated', run: updated });
    }

    /**
     * Checks a resume token's signature (constant time) and expiry and returns
     * its claims; touches no store. Lets an intake layer authorize against the
     * run's agent before `resume()` without acting on an unsigned payload;
     * `resume()` still checks the token against the current wait point.
     * Throws InvalidResumeTokenError for a forged, malformed or expired token.
     */
    inspectResumeToken(token: string): ResumeTokenClaims {
        return verifyResumeToken(this.resumeSecret, token, this.clock.now());
    }

    /**
     * Answers the approval a `waiting` run waits on and requeues it. Single
     * use: a second resume of the same wait point throws InvalidRunStateError.
     * Throws InvalidResumeTokenError for a forged, expired or superseded token.
     */
    async resume(token: string, decision: ResumeDecision): Promise<void> {
        if (decision.approver !== undefined) {
            decision = { ...decision, approver: toInvoker(decision.approver, 'approver') };
        }
        const claims = verifyResumeToken(this.resumeSecret, token, this.clock.now());
        const run = await this.store.getRun(claims.runId);
        if (!run) throw new RunNotFoundError(claims.runId);
        if (run.status !== RunStatus.WAITING || !run.waiting) {
            throw new InvalidRunStateError(`Run "${run.id}" is ${run.status} and not waiting for an approval.`);
        }
        if (run.waiting.tokenId !== claims.tokenId || run.waiting.approvalId !== claims.approvalId) {
            throw new InvalidResumeTokenError('The resume token does not belong to the current approval.');
        }
        await this.answer(run, run.waiting, decision, staleToken);
    }

    /**
     * Answers the current wait point of a `waiting` run without a resume token
     * (the caller authorized the approver) and requeues it, on the same path as
     * `resume()`: the token notified earlier is spent by the same transition.
     * Throws InvalidRunStateError when the run is not waiting, waits on another
     * approval or its wait point expired (`tick()` denies that one).
     */
    async approve(runId: string, answer: ApprovalAnswer): Promise<void> {
        const decision: ResumeDecision = {
            approved: answer.approved,
            ...(answer.reason !== undefined ? { reason: answer.reason } : {}),
            ...(answer.approver !== undefined ? { approver: toInvoker(answer.approver, 'approver') } : {}),
        };
        const run = await this.store.getRun(runId);
        if (!run) throw new RunNotFoundError(runId);
        if (run.status !== RunStatus.WAITING || !run.waiting) {
            throw new InvalidRunStateError(`Run "${run.id}" is ${run.status} and not waiting for an approval.`);
        }
        if (run.waiting.approvalId !== answer.approvalId) {
            throw new InvalidRunStateError(`Run "${run.id}" does not wait on approval "${answer.approvalId}".`);
        }
        if (this.clock.now().getTime() >= run.waiting.expiresAt.getTime()) {
            throw new InvalidRunStateError(`Approval "${answer.approvalId}" of run "${run.id}" expired.`);
        }
        await this.answer(
            run,
            run.waiting,
            decision,
            () => new InvalidRunStateError(`Run "${run.id}" moved on to another approval.`),
        );
    }

    /**
     * Denies every approval past its expiresAt ('approval timed out') and
     * re-sends the notification of every other approval not delivered yet
     * (a failed send, or a crash mid-send). Also runs on every poll.
     */
    async tick(): Promise<void> {
        const now = this.clock.now().getTime();
        const { data } = await this.store.listRuns({ status: [RunStatus.WAITING] });
        for (const listed of data) {
            if (!listed.waiting) continue;
            if (listed.waiting.expiresAt.getTime() > now) {
                const agent = this.agents.get(listed.agent);
                if (!listed.waiting.notifiedAt && agent) await this.notifyApproval(listed, agent, listed.waiting);
                continue;
            }
            try {
                // the listing may be stale by now: the run could wait on a newer approval
                const run = await this.store.getRun(listed.id);
                if (run?.status !== RunStatus.WAITING || !run.waiting || run.waiting.expiresAt.getTime() > now) continue;
                await this.answer(run, run.waiting, { approved: false, reason: APPROVAL_TIMED_OUT }, staleToken);
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
    protected async answer(
        run: Run,
        waiting: WaitPoint,
        decision: ResumeDecision,
        stale: () => Error,
    ): Promise<void> {
        const now = this.clock.now();
        const transitioned = await this.store.updateRun(run.id, {
            status: RunStatus.QUEUED,
            claim: { owner: this.owner, expiresAt: new Date(now.getTime() + this.claimTtlMs) },
            updatedAt: now,
        }, { expectStatus: [RunStatus.WAITING] });

        let queued: Run;
        try {
            // the run may have moved on to another approval since `waiting` was read
            if (transitioned.waiting?.tokenId !== waiting.tokenId) {
                throw stale();
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
                    ...(decision.approver ? { approver: decision.approver } : {}),
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
            }, { expectStatus: [RunStatus.QUEUED] });
        } catch (error) {
            // undo, so the wait point (still on the run) and its token stay answerable
            await this.store.updateRun(run.id, {
                status: RunStatus.WAITING,
                claim: undefined,
                updatedAt: this.clock.now(),
            }, { expectStatus: [RunStatus.QUEUED] }).catch((undoError: unknown) => this.onError(undoError, run));
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
        const updated = await this.ownedUpdate(run.id, {
            status: RunStatus.WAITING,
            waiting,
            usage,
            claim: undefined,
            updatedAt: now,
        });
        if (!updated) return;
        this.emit({ type: 'run.updated', run: updated });
        // a cancel arrived while pausing (an abort cannot interrupt this write): settle, do not notify
        if (updated.cancelRequested || this.executions.get(run.id)?.stop === 'cancel') {
            await this.cancelStored(run.id, [RunStatus.WAITING]).catch((error: unknown) => {
                if (!(error instanceof InvalidRunStateError)) this.onError(error, run);
            });
            return;
        }
        await this.notifyApproval(updated, agent, waiting);
    }

    /**
     * Sends the approval notification unless it was delivered already: a
     * successful send records `waiting.notifiedAt`. A store lock (held for one
     * attempt, at most claimTtlMs) keeps replicas from sending concurrently;
     * the notifier's idempotencyKey dedupes a send whose record was lost. A
     * failed or crashed attempt goes to onError and is retried by tick() on the
     * next poll; the run keeps waiting.
     */
    protected async notifyApproval(run: Run, agent: Agent, waiting: WaitPoint): Promise<void> {
        const name = agent.definition.notify;
        const notifier = name === undefined ? undefined : this.notifiers[name];
        if (!notifier) return;
        const idempotencyKey = `${run.id}:${waiting.approvalId}`;
        const lockKey = `notify:${idempotencyKey}`;
        const attempt = randomUUID();
        let acquired = false;
        const isCurrent = (current: Run | undefined) => current?.status === RunStatus.WAITING &&
            current.waiting?.tokenId === waiting.tokenId;
        try {
            acquired = await this.store.acquire(lockKey, attempt, this.claimTtlMs);
            if (!acquired) return;
            // another attempt may have delivered it since `run` was read
            const current = await this.store.getRun(run.id);
            if (!isCurrent(current) || current?.waiting?.notifiedAt) return;
            await notifier.notify({
                kind: 'approval',
                agent: run.agent,
                runId: run.id,
                title: `Approval required: ${waiting.toolName}`,
                body: `Agent "${run.agent}" wants to call "${waiting.toolName}" with:\n${JSON.stringify(waiting.input, null, 2)}`,
                approvalId: waiting.approvalId,
                resumeToken: createResumeToken(this.resumeSecret, {
                    runId: run.id,
                    approvalId: waiting.approvalId,
                    tokenId: waiting.tokenId,
                    expiresAt: waiting.expiresAt,
                }),
                expiresAt: waiting.expiresAt,
            }, { idempotencyKey, trigger: run.trigger });
            // answered meanwhile: nothing left to record
            if (!isCurrent(await this.store.getRun(run.id))) return;
            const notified = await this.store.updateRun(
                run.id,
                { waiting: { ...waiting, notifiedAt: this.clock.now() } },
                { expectStatus: [RunStatus.WAITING] },
            );
            this.emit({ type: 'run.updated', run: notified });
        } catch (error) {
            if (!(error instanceof InvalidRunStateError)) this.onError(error, run);
        } finally {
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
        // cancel() asked for it while it ran elsewhere (or was interrupted): also for an agent unknown here
        if (run.cancelRequested) {
            await this.finish(run.id, { status: RunStatus.CANCELLED });
            return;
        }
        const agent = this.agents.get(run.agent);
        if (!agent || !await this.isCurrent(run.agent)) {
            // removed or replaced since the claim: left for a replica that runs the agent's current revision
            // guarded by status and owner (`expectStatus: [RUNNING]`, `expectOwner`): a taken-over run is left alone
            const released = await this.ownedUpdate(run.id, {
                status: RunStatus.QUEUED,
                claim: undefined,
                startedAt: undefined,
            });
            if (released) this.emit({ type: 'run.updated', run: released });
            return;
        }
        await executeRun({
            run,
            agent,
            store: this.store,
            clock: this.clock,
            signal,
            finish: (patch) => this.finish(run.id, patch),
            update: async (patch) => {
                const updated = await this.ownedUpdate(run.id, patch);
                if (!updated) throw new InvalidRunStateError(`Run "${run.id}" was taken over by another owner.`);
                this.emit({ type: 'run.updated', run: updated });
                return updated;
            },
            onStepAppended: (step) => this.emit({ type: 'step.appended', step }),
            onDelta: (delta) => this.emit({ type: 'run.delta', delta }),
            pause: (request, usage) => this.pause(run, agent, request, usage),
            toolApprovalSecret: this.resumeSecret,
            ownsRun: () => this.ownsRun(run.id),
            provided: this.provided,
        });
    }

    /**
     * The start guard of one scheduling pass, built from one read of the
     * revision markers (skipped while no folder agent is registered): a run
     * may start when cancel asked for it, or when its agent is registered
     * here and is a code agent or loaded at the stored marker's hash.
     */
    protected async prepareStart(): Promise<(run: Run) => boolean> {
        const folder = this.revisions.values().some((revision) => revision !== undefined);
        const markers = folder ?
            new Map((await this.store.listAgentRevisions()).map((marker) => [marker.agent, marker.hash])) :
            new Map<string, string>();
        return (run) => {
            if (run.cancelRequested) return true;
            if (!this.agents.has(run.agent) || this.syncing.has(run.agent)) return false;
            const revision = this.revisions.get(run.agent);
            return revision === undefined || revision === markers.get(run.agent);
        };
    }

    /** Whether the registered agent is a code agent or loaded at the stored marker's hash. */
    protected async isCurrent(name: string): Promise<boolean> {
        if (this.syncing.has(name)) return false;
        const revision = this.revisions.get(name);
        if (revision === undefined) return true;
        return (await this.store.getAgentRevision(name))?.hash === revision;
    }

    /** A throwing execution fails the run (and releases its claim) instead of leaking. */
    protected guardedExecute(run: Run): Promise<void> {
        const controller = new AbortController();
        const done = (async () => {
            try {
                await this.execute(run, controller.signal);
            } catch (error) {
                // the run belongs to another owner now: its failure is not ours to record
                if (this.executions.get(run.id)?.stop === 'lease-lost') return;
                await this.finish(run.id, { status: RunStatus.FAILED, error: toRunError(error) });
                this.onError(error, run);
            } finally {
                this.executions.delete(run.id);
            }
        })();
        this.executions.set(run.id, { controller, done: done.catch(() => {}) });
        return done;
    }

    /**
     * Settles a `running` run this engine holds the claim of. A run aborted by
     * drain() is marked `interrupted` (claim released, not finished) instead of
     * `cancelled`; after a lost lease nothing is written and undefined resolves.
     */
    protected async finish(id: string, patch: Partial<Run>): Promise<Run | undefined> {
        const stop = this.executions.get(id)?.stop;
        if (stop === 'lease-lost') return undefined;
        const now = this.clock.now();
        const settled: Partial<Run> = stop === 'drain' && patch.status === RunStatus.CANCELLED ?
            {
                status: RunStatus.INTERRUPTED,
                usage: patch.usage,
                claim: undefined,
                updatedAt: now,
            } :
            {
                claim: undefined,
                // a run resumed after a crash may still carry its answered wait point
                waiting: undefined,
                finishedAt: now,
                updatedAt: now,
                ...patch,
            };
        if (settled.usage === undefined) delete settled.usage;
        const updated = await this.ownedUpdate(id, settled);
        if (updated) this.emit({ type: 'run.updated', run: updated });
        return updated;
    }

    /**
     * Updates a `running` run only while this engine holds its claim. Resolves
     * undefined (and aborts the execution) when another owner took it over.
     */
    protected async ownedUpdate(id: string, patch: Partial<Run>): Promise<Run | undefined> {
        try {
            return await this.store.updateRun(id, patch, { expectStatus: [RunStatus.RUNNING], expectOwner: this.owner });
        } catch (error) {
            if (error instanceof InvalidRunStateError && !await this.ownsRun(id)) return undefined;
            throw error;
        }
    }

    /** Whether this engine still holds the run's claim; aborts its execution when not. */
    protected async ownsRun(id: string): Promise<boolean> {
        const run = await this.store.getRun(id);
        if (run?.claim?.owner === this.owner) return true;
        this.loseLease(id);
        return false;
    }

    /**
     * Aborts the local execution of a run another owner may hold now; it writes
     * nothing more. Reported once per execution as a LeaseLostError.
     */
    protected loseLease(id: string): void {
        const execution = this.executions.get(id);
        if (!execution || execution.stop === 'lease-lost') return;
        execution.stop = 'lease-lost';
        execution.controller.abort();
        this.onError(new LeaseLostError(id));
    }

    /** Refuses an agent the engine cannot run: a notifier or a channel it does not have. */
    protected assertRegistrable(agent: Agent): void {
        for (const subscription of agent.definition.channels ?? []) {
            if (!this.channels.has(subscription.channel)) {
                throw new InvalidAgentDefinitionError(`Agent "${agent.name}" subscribes to unknown channel "${subscription.channel}".`);
            }
        }
        const { notify } = agent.definition;
        if (notify !== undefined && !this.notifiers[notify]) {
            throw new InvalidAgentDefinitionError(`Agent "${agent.name}" uses unknown notifier "${notify}".`);
        }
    }

    protected registry(): RegistryContext {
        return {
            store: this.store,
            clock: this.clock,
            claimTtlMs: this.claimTtlMs,
            cancel: (runId) => this.cancel(runId),
            onError: (error, run) => this.onError(error, run),
        };
    }

    protected emit(event: EngineEvent): void {
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
