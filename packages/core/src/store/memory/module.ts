/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isObject } from 'smob';
import type { Artifact } from '../../artifact/types.ts';
import { systemClock } from '../../clock/index.ts';
import type { IClock } from '../../clock/index.ts';
import { InvalidRunStateError, RunNotFoundError } from '../../errors/index.ts';
import type { Checkpoint, Run, Step } from '../../run/types.ts';
import type { IStore } from '../types.ts';
import { copy } from './helpers.ts';
import type { Expiring } from './types.ts';

/**
 * In-memory Store. Methods are single-threaded and never await between a
 * check and the matching write, which makes the atomic operations atomic.
 */
export class MemoryStore implements IStore {
    protected clock: IClock;

    protected runs = new Map<string, Run>();

    protected steps = new Map<string, Step[]>();

    protected checkpoints = new Map<string, Checkpoint>();

    protected keys = new Map<string, Expiring & { runId: string }>();

    protected locks = new Map<string, Expiring & { owner: string }>();

    protected effects = new Map<string, { result: unknown }>();

    protected kv = new Map<string, unknown>();

    protected docs = new Map<string, Map<string, unknown>>();

    protected artifacts = new Map<string, { artifact: Artifact; data: Uint8Array }>();

    constructor(opts: { clock?: IClock } = {}) {
        this.clock = opts.clock ?? systemClock;
    }

    protected now(): number {
        return this.clock.now().getTime();
    }

    // IRunStore

    async createRun(run: Run): Promise<boolean> {
        if (this.runs.has(run.id)) return false;
        this.runs.set(run.id, copy(run));
        return true;
    }

    async getRun(id: string): Promise<Run | undefined> {
        const run = this.runs.get(id);
        return run ? copy(run) : undefined;
    }

    async updateRun(
        id: string,
        patch: Partial<Run>,
        opts: { expectStatus?: Run['status'][]; expectOwner?: string } = {},
    ): Promise<Run> {
        const run = this.runs.get(id);
        if (!run) throw new RunNotFoundError(id);
        if (opts.expectStatus && !opts.expectStatus.includes(run.status)) {
            throw new InvalidRunStateError(
                `Run "${id}" is "${run.status}", expected one of: ${opts.expectStatus.join(', ')}.`,
            );
        }
        if (opts.expectOwner !== undefined && run.claim?.owner !== opts.expectOwner) {
            throw new InvalidRunStateError(
                `Run "${id}" is not claimed by "${opts.expectOwner}" (claim: ${run.claim?.owner ?? 'none'}).`,
            );
        }
        const next = {
            ...run,
            ...copy(patch),
            id,
            updatedAt: patch.updatedAt ? copy(patch.updatedAt) : this.clock.now(),
        };
        this.runs.set(id, next);
        return copy(next);
    }

    async listRuns(q: {
        agent?: string;
        status?: Run['status'][];
        concurrencyKey?: string;
        limit?: number;
        offset?: number;
        order?: 'asc' | 'desc';
    }): Promise<{ data: Run[]; total: number }> {
        const direction = q.order === 'desc' ? -1 : 1;
        const matched = this.runs.values().toArray()
            .filter((r) => (q.agent === undefined || r.agent === q.agent) &&
                (q.status === undefined || q.status.includes(r.status)) &&
                (q.concurrencyKey === undefined || r.concurrencyKey === q.concurrencyKey))
            .sort((a, b) => direction * (a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id, 'en')));
        const offset = q.offset ?? 0;
        const end = q.limit === undefined ? undefined : offset + q.limit;
        return { data: matched.slice(offset, end).map((r) => copy(r)), total: matched.length };
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

    // IStepStore

    async appendStep(step: Step): Promise<void> {
        const list = this.steps.get(step.runId) ?? [];
        list.push(copy(step));
        this.steps.set(step.runId, list);
    }

    async listSteps(runId: string): Promise<Step[]> {
        return copy([...(this.steps.get(runId) ?? [])].sort((a, b) => a.index - b.index));
    }

    // ICheckpointStore

    async saveCheckpoint(cp: Checkpoint): Promise<void> {
        const current = this.checkpoints.get(cp.runId);
        if (!current || cp.stepIndex >= current.stepIndex) {
            this.checkpoints.set(cp.runId, copy(cp));
        }
    }

    async latestCheckpoint(runId: string): Promise<Checkpoint | undefined> {
        const cp = this.checkpoints.get(runId);
        return cp ? copy(cp) : undefined;
    }

    // IIdempotencyStore

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

    // ILockStore

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

    // IEffectStore

    async getEffect(key: string): Promise<{ result: unknown } | undefined> {
        const effect = this.effects.get(key);
        return effect ? copy(effect) : undefined;
    }

    async putEffect(key: string, result: unknown): Promise<void> {
        this.effects.set(key, { result: copy(result) });
    }

    // IStateStore

    async kvGet(agent: string, key: string): Promise<unknown> {
        return copy(this.kv.get(`${agent}\u0000${key}`));
    }

    async kvSet(agent: string, key: string, value: unknown): Promise<void> {
        this.kv.set(`${agent}\u0000${key}`, copy(value));
    }

    async docList(
        agent: string,
        coll: string,
        q: { where?: Record<string, unknown>; limit?: number } = {},
    ): Promise<Array<{ id: string; doc: unknown }>> {
        const entries = (this.docs.get(`${agent}\u0000${coll}`) ?? new Map()).entries().toArray()
            .map(([id, doc]) => ({ id, doc }))
            .filter(({ doc }) => Object.entries(q.where ?? {}).every(
                ([k, v]) => isObject(doc) && doc[k] === v,
            ));
        return copy(q.limit === undefined ? entries : entries.slice(0, q.limit));
    }

    async docUpsert(agent: string, coll: string, id: string, doc: unknown): Promise<void> {
        const name = `${agent}\u0000${coll}`;
        const collection = this.docs.get(name) ?? new Map<string, unknown>();
        collection.set(id, copy(doc));
        this.docs.set(name, collection);
    }

    async docDelete(agent: string, coll: string, id: string): Promise<void> {
        this.docs.get(`${agent}\u0000${coll}`)?.delete(id);
    }

    // IArtifactStore

    async putArtifact(artifact: Artifact, data: Uint8Array): Promise<boolean> {
        if (this.artifacts.has(artifact.id)) return false;
        this.artifacts.set(artifact.id, { artifact: copy(artifact), data: new Uint8Array(data) });
        return true;
    }

    async getArtifact(id: string): Promise<Artifact | undefined> {
        const entry = this.artifacts.get(id);
        return entry ? copy(entry.artifact) : undefined;
    }

    async readArtifact(id: string): Promise<Uint8Array | undefined> {
        const entry = this.artifacts.get(id);
        return entry ? new Uint8Array(entry.data) : undefined;
    }

    async listArtifacts(runId: string): Promise<Artifact[]> {
        return this.artifacts.values().toArray()
            .map((entry) => entry.artifact)
            .filter((artifact) => artifact.runId === runId)
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id, 'en'))
            .map((artifact) => copy(artifact));
    }
}
