/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { 
    Checkpoint, 
    Run, 
    RunStatusLiteral, 
    Step, 
} from '../run/types.ts';

/**
 * Expiry rule shared by every TTL (run claims, idempotency keys, locks):
 * a lease/key created at time T with ttlMs expires AT T + ttlMs, i.e. at exactly
 * `expiresAt` it already counts as expired and can be taken over.
 *
 * Implementations must return copies: mutating a value passed in after the call,
 * or a value returned from the store, must never change what the store holds.
 */
export interface IRunStore {
    /**
     * Atomic insert-if-absent: resolves false and keeps the stored run when a run
     * with that id exists (two dispatches may create the run an idempotency key names).
     */
    createRun(run: Run): Promise<boolean>;
    getRun(id: string): Promise<Run | undefined>;
    /**
     * Throws InvalidRunStateError when `expectStatus` does not match the current
     * status, or when `expectOwner` is given and the run's claim is absent or held
     * by another owner (expiry is not checked: a lease is lost once taken over).
     */
    updateRun(id: string, patch: Partial<Run>, opts?: { expectStatus?: RunStatusLiteral[]; expectOwner?: string }): Promise<Run>;
    /** Ordered by createdAt ascending, ties broken by id ascending. `total` ignores limit/offset. */
    listRuns(q: {
        agent?: string;
        status?: RunStatusLiteral[];
        concurrencyKey?: string;
        limit?: number;
        offset?: number;
    }): Promise<{ data: Run[]; total: number }>;
    /** Atomic: only succeeds when unleased or the lease expired. */
    claimRun(id: string, owner: string, ttlMs: number): Promise<boolean>;
    /** Extends the lease; only succeeds for the current, unexpired owner. */
    renewClaim(id: string, owner: string, ttlMs: number): Promise<boolean>;
}

export interface IStepStore {
    appendStep(step: Step): Promise<void>;
    listSteps(runId: string): Promise<Step[]>;
}

export interface ICheckpointStore {
    /** Keeps the highest stepIndex; an equal stepIndex replaces (approval responses are appended that way). */
    saveCheckpoint(cp: Checkpoint): Promise<void>;
    latestCheckpoint(runId: string): Promise<Checkpoint | undefined>;
}

export interface IIdempotencyStore {
    /** Atomic: the first caller per (scope, key) creates; others get the winner's runId. */
    claimKey(scope: string, key: string, runId: string, ttlMs: number): Promise<{ created: boolean; runId: string }>;
}

export interface ILockStore {
    acquire(key: string, owner: string, ttlMs: number): Promise<boolean>;
    release(key: string, owner: string): Promise<void>;
}

export interface IEffectStore {
    getEffect(key: string): Promise<{ result: unknown } | undefined>;
    putEffect(key: string, result: unknown): Promise<void>;
}

export interface IStateStore {
    kvGet(agent: string, key: string): Promise<unknown>;
    kvSet(agent: string, key: string, value: unknown): Promise<void>;
    /** `where` matches by top-level equality. */
    docList(
        agent: string,
        coll: string,
        q?: { where?: Record<string, unknown>; limit?: number },
    ): Promise<Array<{ id: string; doc: unknown }>>;
    docUpsert(agent: string, coll: string, id: string, doc: unknown): Promise<void>;
    docDelete(agent: string, coll: string, id: string): Promise<void>;
}

export interface IStore extends IRunStore, IStepStore, ICheckpointStore, IIdempotencyStore, ILockStore, IEffectStore, IStateStore {}
