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
    IClock,
    IRunStore,
    Run,
    RunStatusLiteral,
} from '@chamberu/core';
import type { DataSource } from 'typeorm';
import { TableName } from '../entities/constants.ts';
import {
    runPlaceholder,
    toRun,
    toRunColumns,
} from './helpers.ts';
import type { RunRow, TypeormStoreOptions } from './types.ts';

const { RUNS } = TableName;

/**
 * Postgres store. Every method is parameterized SQL through the data source,
 * every atomic operation a single statement, with time taken from the clock.
 */
export class TypeormStore implements IRunStore {
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
}
