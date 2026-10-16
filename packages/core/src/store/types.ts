import type { 
    Checkpoint, 
    Run, 
    RunStatus, 
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
export interface RunStore {
    createRun(run: Run): Promise<void>;
    getRun(id: string): Promise<Run | undefined>;
    /** Throws InvalidRunStateError when `expectStatus` does not match the current status. */
    updateRun(id: string, patch: Partial<Run>, opts?: { expectStatus?: RunStatus[] }): Promise<Run>;
    /** Ordered by createdAt ascending, ties broken by id ascending. `total` ignores limit/offset. */
    listRuns(q: {
        agent?: string;
        status?: RunStatus[];
        concurrencyKey?: string;
        limit?: number;
        offset?: number;
    }): Promise<{ data: Run[]; total: number }>;
    /** Atomic: only succeeds when unleased or the lease expired. */
    claimRun(id: string, owner: string, ttlMs: number): Promise<boolean>;
    /** Extends the lease; only succeeds for the current, unexpired owner. */
    renewClaim(id: string, owner: string, ttlMs: number): Promise<boolean>;
}

export interface StepStore {
    appendStep(step: Step): Promise<void>;
    listSteps(runId: string): Promise<Step[]>;
}

export interface CheckpointStore {
    /** Keeps the highest stepIndex; an equal stepIndex replaces (approval responses are appended that way). */
    saveCheckpoint(cp: Checkpoint): Promise<void>;
    latestCheckpoint(runId: string): Promise<Checkpoint | undefined>;
}

export interface IdempotencyStore {
    /** Atomic: the first caller per (scope, key) creates; others get the winner's runId. */
    claimKey(scope: string, key: string, runId: string, ttlMs: number): Promise<{ created: boolean; runId: string }>;
}

export interface LockStore {
    acquire(key: string, owner: string, ttlMs: number): Promise<boolean>;
    release(key: string, owner: string): Promise<void>;
}

export interface EffectStore {
    getEffect(key: string): Promise<{ result: unknown } | undefined>;
    putEffect(key: string, result: unknown): Promise<void>;
}

export interface StateStore {
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

export interface Store extends RunStore, StepStore, CheckpointStore, IdempotencyStore, LockStore, EffectStore, StateStore {}
