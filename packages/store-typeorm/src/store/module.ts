/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    InvalidRunStateError,
    RunNotFoundError,
    systemClock,
} from '@chamberu/core';
import type {
    Checkpoint,
    IClock,
    IStore,
    Run,
    RunStatusLiteral,
    Step,
} from '@chamberu/core';
import type { DataSource } from 'typeorm';
import { TableName } from '../entities/constants.ts';
import {
    json,
    runPlaceholder,
    toCheckpoint,
    toRun,
    toRunColumns,
    toStep,
} from './helpers.ts';
import type {
    CheckpointRow,
    PurgeResult,
    RunRow,
    StepRow,
    TypeormStoreOptions,
} from './types.ts';

const {
    RUNS,
    STEPS,
    CHECKPOINTS,
    IDEMPOTENCY_KEYS,
    LOCKS,
    EFFECTS,
    KV,
    DOCS,
} = TableName;

/**
 * Postgres store. Every method is parameterized SQL through the data source,
 * every atomic operation a single statement, with time taken from the clock.
 */
export class TypeormStore implements IStore {
    protected dataSource: DataSource;

    protected clock: IClock;

    constructor(opts: TypeormStoreOptions) {
        this.dataSource = opts.dataSource;
        this.clock = opts.clock ?? systemClock;
    }

    protected now(): Date {
        return this.clock.now();
    }

    /**
     * Run one parameterized statement and return its rows. The structured
     * result keeps UPDATE and DELETE uniform: DataSource.query returns
     * [rows, rowCount] for those on Postgres.
     */
    protected async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
        const queryRunner = this.dataSource.createQueryRunner();
        try {
            const result = await queryRunner.query(sql, params, true);
            return (result.records ?? []) as T[];
        } finally {
            await queryRunner.release();
        }
    }

    // IRunStore

    async createRun(run: Run): Promise<boolean> {
        const columns = { id: run.id, ...toRunColumns(run) };
        const names = Object.keys(columns);
        const placeholders = names.map((name, i) => runPlaceholder(name, i + 1));
        const rows = await this.query(
            `INSERT INTO ${RUNS} (${names.map((n) => `"${n}"`).join(', ')}) VALUES (${placeholders.join(', ')}) ` +
            'ON CONFLICT (id) DO NOTHING RETURNING id',
            Object.values(columns),
        );
        return rows.length === 1;
    }

    async getRun(id: string): Promise<Run | undefined> {
        const rows = await this.query<RunRow>(`SELECT * FROM ${RUNS} WHERE id = $1`, [id]);
        return rows.length > 0 ? toRun(rows[0]!) : undefined;
    }

    async updateRun(
        id: string,
        patch: Partial<Run>,
        opts: { expectStatus?: RunStatusLiteral[]; expectOwner?: string } = {},
    ): Promise<Run> {
        const columns = toRunColumns({ ...patch, updatedAt: patch.updatedAt ?? this.now() });
        const params: unknown[] = [id];
        const assignments = Object.entries(columns).map(([column, value]) => {
            params.push(value);
            return `"${column}" = ${runPlaceholder(column, params.length)}`;
        });

        let where = 'id = $1';
        if (opts.expectStatus) {
            params.push(opts.expectStatus);
            where += ` AND status = ANY($${params.length}::text[])`;
        }
        if (opts.expectOwner !== undefined) {
            params.push(opts.expectOwner);
            where += ` AND claim_owner = $${params.length}`;
        }

        const rows = await this.query<RunRow>(
            `UPDATE ${RUNS} SET ${assignments.join(', ')} WHERE ${where} RETURNING *`,
            params,
        );
        if (rows.length === 1) {
            return toRun(rows[0]!);
        }

        const current = await this.query<{ status: RunStatusLiteral; claim_owner: string | null }>(
            `SELECT status, claim_owner FROM ${RUNS} WHERE id = $1`,
            [id],
        );
        if (current.length === 0) {
            throw new RunNotFoundError(id);
        }

        const { status, claim_owner: owner } = current[0]!;
        if (opts.expectStatus && !opts.expectStatus.includes(status)) {
            throw new InvalidRunStateError(
                `Run "${id}" is "${status}", expected one of: ${opts.expectStatus.join(', ')}.`,
            );
        }
        if (opts.expectOwner !== undefined && owner !== opts.expectOwner) {
            throw new InvalidRunStateError(
                `Run "${id}" is not claimed by "${opts.expectOwner}" (claim: ${owner ?? 'none'}).`,
            );
        }

        throw new InvalidRunStateError(`Run "${id}" changed concurrently.`);
    }

    async listRuns(q: {
        agent?: string;
        status?: RunStatusLiteral[];
        concurrencyKey?: string;
        limit?: number;
        offset?: number;
    }): Promise<{ data: Run[]; total: number }> {
        const params: unknown[] = [];
        const conditions: string[] = [];
        if (q.agent !== undefined) {
            params.push(q.agent);
            conditions.push(`agent = $${params.length}`);
        }
        if (q.status !== undefined) {
            params.push(q.status);
            conditions.push(`status = ANY($${params.length}::text[])`);
        }
        if (q.concurrencyKey !== undefined) {
            params.push(q.concurrencyKey);
            conditions.push(`concurrency_key = $${params.length}`);
        }
        const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

        const [{ total }] = await this.query<{ total: number }>(
            `SELECT count(*)::int AS total FROM ${RUNS}${where}`,
            params,
        ) as [{ total: number }];

        const pageParams = [...params];
        let page = '';
        if (q.limit !== undefined) {
            pageParams.push(q.limit);
            page += ` LIMIT $${pageParams.length}`;
        }
        pageParams.push(q.offset ?? 0);
        page += ` OFFSET $${pageParams.length}`;

        const rows = await this.query<RunRow>(
            `SELECT * FROM ${RUNS}${where} ORDER BY created_at ASC, id ASC${page}`,
            pageParams,
        );
        return { data: rows.map((row) => toRun(row)), total };
    }

    async claimRun(id: string, owner: string, ttlMs: number): Promise<boolean> {
        const now = this.now();
        const rows = await this.query(
            `UPDATE ${RUNS} SET claim_owner = $2, claim_expires_at = $3 ` +
            'WHERE id = $1 AND (claim_owner IS NULL OR claim_expires_at <= $4) RETURNING id',
            [id, owner, new Date(now.getTime() + ttlMs), now],
        );
        return rows.length === 1;
    }

    async renewClaim(id: string, owner: string, ttlMs: number): Promise<boolean> {
        const now = this.now();
        const rows = await this.query(
            `UPDATE ${RUNS} SET claim_owner = $2, claim_expires_at = $3 ` +
            'WHERE id = $1 AND claim_owner = $2 AND claim_expires_at > $4 RETURNING id',
            [id, owner, new Date(now.getTime() + ttlMs), now],
        );
        return rows.length === 1;
    }

    // IStepStore

    async appendStep(step: Step): Promise<void> {
        await this.query(
            `INSERT INTO ${STEPS} (run_id, step_index, kind, name, input, output, error, started_at, finished_at) ` +
            'VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9)',
            [
                step.runId,
                step.index,
                step.kind,
                step.name ?? null,
                json(step.input),
                json(step.output),
                json(step.error),
                step.startedAt,
                step.finishedAt,
            ],
        );
    }

    async listSteps(runId: string): Promise<Step[]> {
        const rows = await this.query<StepRow>(
            `SELECT * FROM ${STEPS} WHERE run_id = $1 ORDER BY step_index ASC, seq ASC`,
            [runId],
        );
        return rows.map((row) => toStep(row));
    }

    // ICheckpointStore

    async saveCheckpoint(cp: Checkpoint): Promise<void> {
        await this.query(
            `INSERT INTO ${CHECKPOINTS} (run_id, step_index, messages, finish_reason, created_at) ` +
            'VALUES ($1, $2, $3::jsonb, $4, $5) ' +
            'ON CONFLICT (run_id) DO UPDATE SET step_index = EXCLUDED.step_index, messages = EXCLUDED.messages, ' +
            'finish_reason = EXCLUDED.finish_reason, created_at = EXCLUDED.created_at ' +
            `WHERE ${CHECKPOINTS}.step_index <= EXCLUDED.step_index`,
            [
                cp.runId,
                cp.stepIndex,
                json(cp.messages),
                cp.finishReason ?? null,
                cp.createdAt,
            ],
        );
    }

    async latestCheckpoint(runId: string): Promise<Checkpoint | undefined> {
        const rows = await this.query<CheckpointRow>(
            `SELECT * FROM ${CHECKPOINTS} WHERE run_id = $1`,
            [runId],
        );
        return rows.length > 0 ? toCheckpoint(rows[0]!) : undefined;
    }

    // IIdempotencyStore

    async claimKey(scope: string, key: string, runId: string, ttlMs: number): Promise<{ created: boolean; runId: string }> {
        // A miss on the SELECT means a concurrent purge removed the expired
        // key between the two statements; the next attempt then inserts.
        for (;;) {
            const now = this.now();
            const created = await this.query<{ run_id: string }>(
                `INSERT INTO ${IDEMPOTENCY_KEYS} (scope, key, run_id, expires_at) VALUES ($1, $2, $3, $4) ` +
                'ON CONFLICT (scope, key) DO UPDATE SET run_id = EXCLUDED.run_id, expires_at = EXCLUDED.expires_at ' +
                `WHERE ${IDEMPOTENCY_KEYS}.expires_at <= $5 RETURNING run_id`,
                [scope, key, runId, new Date(now.getTime() + ttlMs), now],
            );
            if (created.length > 0) {
                return { created: true, runId: created[0]!.run_id };
            }

            const existing = await this.query<{ run_id: string }>(
                `SELECT run_id FROM ${IDEMPOTENCY_KEYS} WHERE scope = $1 AND key = $2`,
                [scope, key],
            );
            if (existing.length > 0) {
                return { created: false, runId: existing[0]!.run_id };
            }
        }
    }

    // ILockStore

    async acquire(key: string, owner: string, ttlMs: number): Promise<boolean> {
        const now = this.now();
        const rows = await this.query(
            `INSERT INTO ${LOCKS} (key, owner, expires_at) VALUES ($1, $2, $3) ` +
            'ON CONFLICT (key) DO UPDATE SET owner = EXCLUDED.owner, expires_at = EXCLUDED.expires_at ' +
            `WHERE ${LOCKS}.expires_at <= $4 RETURNING key`,
            [key, owner, new Date(now.getTime() + ttlMs), now],
        );
        return rows.length === 1;
    }

    async release(key: string, owner: string): Promise<void> {
        await this.query(`DELETE FROM ${LOCKS} WHERE key = $1 AND owner = $2`, [key, owner]);
    }

    // IEffectStore

    async getEffect(key: string): Promise<{ result: unknown } | undefined> {
        const rows = await this.query<{ result: unknown }>(
            `SELECT result FROM ${EFFECTS} WHERE key = $1`,
            [key],
        );
        return rows.length > 0 ? { result: rows[0]!.result } : undefined;
    }

    async putEffect(key: string, result: unknown): Promise<void> {
        await this.query(
            `INSERT INTO ${EFFECTS} (key, result) VALUES ($1, $2::jsonb) ` +
            'ON CONFLICT (key) DO UPDATE SET result = EXCLUDED.result',
            [key, json(result ?? null)],
        );
    }

    // IStateStore

    async kvGet(agent: string, key: string): Promise<unknown> {
        const rows = await this.query<{ value: unknown }>(
            `SELECT value FROM ${KV} WHERE agent = $1 AND key = $2`,
            [agent, key],
        );
        return rows.length > 0 ? rows[0]!.value : undefined;
    }

    async kvSet(agent: string, key: string, value: unknown): Promise<void> {
        if (value === undefined) {
            await this.query(`DELETE FROM ${KV} WHERE agent = $1 AND key = $2`, [agent, key]);
            return;
        }

        await this.query(
            `INSERT INTO ${KV} (agent, key, value) VALUES ($1, $2, $3::jsonb) ` +
            'ON CONFLICT (agent, key) DO UPDATE SET value = EXCLUDED.value',
            [agent, key, json(value)],
        );
    }

    async docList(
        agent: string,
        coll: string,
        q: { where?: Record<string, unknown>; limit?: number } = {},
    ): Promise<Array<{ id: string; doc: unknown }>> {
        const params: unknown[] = [agent, coll];
        let sql = `SELECT id, doc FROM ${DOCS} WHERE agent = $1 AND collection = $2`;
        if (q.where && Object.keys(q.where).length > 0) {
            params.push(json(q.where));
            sql += ` AND doc @> $${params.length}::jsonb`;
        }
        sql += ' ORDER BY id ASC';
        if (q.limit !== undefined) {
            params.push(q.limit);
            sql += ` LIMIT $${params.length}`;
        }

        const rows = await this.query<{ id: string; doc: unknown }>(sql, params);
        return rows.map((row) => ({ id: row.id, doc: row.doc }));
    }

    async docUpsert(agent: string, coll: string, id: string, doc: unknown): Promise<void> {
        await this.query(
            `INSERT INTO ${DOCS} (agent, collection, id, doc) VALUES ($1, $2, $3, $4::jsonb) ` +
            'ON CONFLICT (agent, collection, id) DO UPDATE SET doc = EXCLUDED.doc',
            [agent, coll, id, json(doc ?? null)],
        );
    }

    async docDelete(agent: string, coll: string, id: string): Promise<void> {
        await this.query(
            `DELETE FROM ${DOCS} WHERE agent = $1 AND collection = $2 AND id = $3`,
            [agent, coll, id],
        );
    }

    // Maintenance

    /**
     * Delete idempotency keys and locks expired at `now` (default: the clock's
     * time). Effects have no expiry and are never purged.
     */
    async purgeExpired(now: Date = this.now()): Promise<PurgeResult> {
        const count = async (table: string) => {
            const rows = await this.query<{ n: number }>(
                `WITH deleted AS (DELETE FROM ${table} WHERE expires_at <= $1 RETURNING 1) ` +
                'SELECT count(*)::int AS n FROM deleted',
                [now],
            );
            return rows[0]!.n;
        };

        return {
            idempotencyKeys: await count(IDEMPOTENCY_KEYS),
            locks: await count(LOCKS),
        };
    }
}
