import { systemClock } from '../clock.ts';
import type { Clock } from '../clock.ts';
import { InvalidRunStateError, RunNotFoundError } from '../errors.ts';
import type { Checkpoint, Run, Step } from '../run/types.ts';
import type { Store } from './types.ts';

interface Expiring {
    expiresAt: number;
}

/**
 * In-memory Store. Methods are single-threaded and never await between a
 * check and the matching write, which makes the atomic operations atomic.
 */
export class MemoryStore implements Store {
    protected clock: Clock;

    protected runs = new Map<string, Run>();

    protected steps = new Map<string, Step[]>();

    protected checkpoints = new Map<string, Checkpoint>();

    protected keys = new Map<string, Expiring & { runId: string }>();

    protected locks = new Map<string, Expiring & { owner: string }>();

    protected effects = new Map<string, { result: unknown }>();

    protected kv = new Map<string, unknown>();

    protected docs = new Map<string, Map<string, unknown>>();

    constructor(opts: { clock?: Clock } = {}) {
        this.clock = opts.clock ?? systemClock;
    }

    protected now(): number {
        return this.clock.now().getTime();
    }

    // RunStore

    async createRun(run: Run): Promise<void> {
        this.runs.set(run.id, { ...run });
    }

    async getRun(id: string): Promise<Run | undefined> {
        const run = this.runs.get(id);
        return run ? { ...run } : undefined;
    }

    async updateRun(id: string, patch: Partial<Run>, opts: { expectStatus?: Run['status'][] } = {}): Promise<Run> {
        const run = this.runs.get(id);
        if (!run) throw new RunNotFoundError(id);
        if (opts.expectStatus && !opts.expectStatus.includes(run.status)) {
            throw new InvalidRunStateError(
                `Run "${id}" is "${run.status}", expected one of: ${opts.expectStatus.join(', ')}.`,
            );
        }
        const next = {
            ...run, 
            ...patch, 
            id, 
            updatedAt: patch.updatedAt ?? this.clock.now(), 
        };
        this.runs.set(id, next);
        return { ...next };
    }

    async listRuns(q: {
        agent?: string;
        status?: Run['status'][];
        concurrencyKey?: string;
        limit?: number;
        offset?: number;
    }): Promise<{ data: Run[]; total: number }> {
        const matched = this.runs.values().toArray()
            .filter((r) => (q.agent === undefined || r.agent === q.agent) &&
                (q.status === undefined || q.status.includes(r.status)) &&
                (q.concurrencyKey === undefined || r.concurrencyKey === q.concurrencyKey))
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        const offset = q.offset ?? 0;
        const end = q.limit === undefined ? undefined : offset + q.limit;
        return { data: matched.slice(offset, end).map((r) => ({ ...r })), total: matched.length };
    }

    async claimRun(id: string, owner: string, ttlMs: number): Promise<boolean> {
        const run = this.runs.get(id);
        if (!run) return false;
        const now = this.now();
        if (run.claim && run.claim.expiresAt.getTime() > now) return false;
        run.claim = { owner, expiresAt: new Date(now + ttlMs) };
        return true;
    }

    async renewClaim(id: string, owner: string, ttlMs: number): Promise<boolean> {
        const run = this.runs.get(id);
        const now = this.now();
        if (!run?.claim || run.claim.owner !== owner || run.claim.expiresAt.getTime() <= now) return false;
        run.claim = { owner, expiresAt: new Date(now + ttlMs) };
        return true;
    }

    // StepStore

    async appendStep(step: Step): Promise<void> {
        const list = this.steps.get(step.runId) ?? [];
        list.push(step);
        this.steps.set(step.runId, list);
    }

    async listSteps(runId: string): Promise<Step[]> {
        return [...(this.steps.get(runId) ?? [])].sort((a, b) => a.index - b.index);
    }

    // CheckpointStore

    async saveCheckpoint(cp: Checkpoint): Promise<void> {
        const current = this.checkpoints.get(cp.runId);
        if (!current || cp.stepIndex >= current.stepIndex) {
            this.checkpoints.set(cp.runId, cp);
        }
    }

    async latestCheckpoint(runId: string): Promise<Checkpoint | undefined> {
        return this.checkpoints.get(runId);
    }

    // IdempotencyStore

    async claimKey(scope: string, key: string, runId: string, ttlMs: number): Promise<{ created: boolean; runId: string }> {
        const id = `${scope}\u0000${key}`;
        const now = this.now();
        const existing = this.keys.get(id);
        if (existing && existing.expiresAt > now) {
            return { created: false, runId: existing.runId };
        }
        this.keys.set(id, { runId, expiresAt: now + ttlMs });
        return { created: true, runId };
    }

    // LockStore

    async acquire(key: string, owner: string, ttlMs: number): Promise<boolean> {
        const now = this.now();
        const existing = this.locks.get(key);
        if (existing && existing.expiresAt > now) return false;
        this.locks.set(key, { owner, expiresAt: now + ttlMs });
        return true;
    }

    async release(key: string, owner: string): Promise<void> {
        if (this.locks.get(key)?.owner === owner) this.locks.delete(key);
    }

    // EffectStore

    async getEffect(key: string): Promise<{ result: unknown } | undefined> {
        return this.effects.get(key);
    }

    async putEffect(key: string, result: unknown): Promise<void> {
        this.effects.set(key, { result });
    }

    // StateStore

    async kvGet(agent: string, key: string): Promise<unknown> {
        return this.kv.get(`${agent}\u0000${key}`);
    }

    async kvSet(agent: string, key: string, value: unknown): Promise<void> {
        this.kv.set(`${agent}\u0000${key}`, value);
    }

    async docList(
        agent: string,
        coll: string,
        q: { where?: Record<string, unknown>; limit?: number } = {},
    ): Promise<Array<{ id: string; doc: unknown }>> {
        const entries = (this.docs.get(`${agent}\u0000${coll}`) ?? new Map()).entries().toArray()
            .map(([id, doc]) => ({ id, doc }))
            .filter(({ doc }) => Object.entries(q.where ?? {}).every(
                ([k, v]) => typeof doc === 'object' && doc !== null && (doc as Record<string, unknown>)[k] === v,
            ));
        return q.limit === undefined ? entries : entries.slice(0, q.limit);
    }

    async docUpsert(agent: string, coll: string, id: string, doc: unknown): Promise<void> {
        const name = `${agent}\u0000${coll}`;
        const collection = this.docs.get(name) ?? new Map<string, unknown>();
        collection.set(id, doc);
        this.docs.set(name, collection);
    }

    async docDelete(agent: string, coll: string, id: string): Promise<void> {
        this.docs.get(`${agent}\u0000${coll}`)?.delete(id);
    }
}
