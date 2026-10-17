/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSource } from 'typeorm';
import {
    afterAll,
    beforeAll,
    beforeEach,
    expect,
    it,
} from 'vitest';
import { InvalidRunStateError, RunNotFoundError } from '@chamberu/core';
import type { Run } from '@chamberu/core';
import { ControllableClock } from '@chamberu/test-kit';
import { TypeormStore } from '@chamberu/store-typeorm';
import { createTestDataSource, describePostgres, truncateStore } from '../../utils/database.ts';

function makeRun(id: string, overrides: Partial<Run> = {}): Run {
    const createdAt = new Date(1_000);
    return {
        id,
        agent: 'a',
        status: 'queued',
        trigger: {
            id: `t-${id}`,
            agent: 'a',
            trigger: 'manual',
            source: 'manual',
            payload: { n: 1 },
            receivedAt: new Date(1_234_567),
        },
        usage: { inputTokens: 1, outputTokens: 2 },
        createdAt,
        updatedAt: createdAt,
        ...overrides,
    };
}

describePostgres('TypeormStore runs', () => {
    let dataSource: DataSource;
    let clock: ControllableClock;
    let store: TypeormStore;

    beforeAll(async () => {
        dataSource = await createTestDataSource();
    });

    beforeEach(async () => {
        await truncateStore(dataSource);
        clock = new ControllableClock(new Date(10_000));
        store = new TypeormStore({ dataSource, clock });
    });

    afterAll(async () => {
        await dataSource.destroy();
    });

    it('roundtrips every Run field with Date instances', async () => {
        const run = makeRun('r1', {
            concurrencyKey: 'ck',
            thread: 'th',
            output: { ok: true },
            error: { code: 'X', message: 'm' },
            waiting: {
                kind: 'approval',
                approvalId: 'ap1',
                toolName: 'tool',
                input: { a: [1, 2] },
                expiresAt: new Date('2026-03-08T07:15:00.456Z'),
                tokenId: 'tok',
                notifiedAt: new Date(2_000_001),
            },
            cancelRequested: true,
            startedAt: new Date('2026-03-08T07:30:00.123Z'),
            finishedAt: new Date('2026-11-01T05:30:00.123Z'),
        });
        await expect(store.createRun(run)).resolves.toBe(true);

        const got = await store.getRun('r1');
        expect(got).toEqual(run);
        expect(got!.trigger.receivedAt).toBeInstanceOf(Date);
        expect(got!.waiting!.expiresAt).toBeInstanceOf(Date);
        expect(got!.waiting!.notifiedAt).toBeInstanceOf(Date);
        expect(got!.createdAt).toBeInstanceOf(Date);
        expect(got!.trigger.receivedAt.getTime()).toBe(run.trigger.receivedAt.getTime());
        expect(got!.waiting!.expiresAt.getTime()).toBe(run.waiting!.expiresAt.getTime());
        expect(got!.waiting!.notifiedAt!.getTime()).toBe(run.waiting!.notifiedAt!.getTime());
        expect(got!.createdAt.getTime()).toBe(run.createdAt.getTime());
        expect(got!.updatedAt.getTime()).toBe(run.updatedAt.getTime());
        expect(got!.startedAt!.getTime()).toBe(run.startedAt!.getTime());
        expect(got!.finishedAt!.getTime()).toBe(run.finishedAt!.getTime());

        await expect(store.claimRun('r1', 'o1', 3_000)).resolves.toBe(true);
        const claimed = await store.getRun('r1');
        expect(claimed!.claim).toEqual({ owner: 'o1', expiresAt: new Date(13_000) });
        expect(claimed!.claim!.expiresAt).toBeInstanceOf(Date);

        const minimal = makeRun('r2');
        await store.createRun(minimal);
        const gotMinimal = await store.getRun('r2');
        expect(gotMinimal).toEqual(minimal);
        const keys = Object.keys(gotMinimal!);
        for (const key of ['output', 'error', 'waiting', 'claim', 'cancelRequested', 'concurrencyKey', 'thread', 'startedAt', 'finishedAt']) {
            expect(keys).not.toContain(key);
        }
    });

    it('createRun keeps the stored run on a duplicate id', async () => {
        await expect(store.createRun(makeRun('r1', { thread: 'first' }))).resolves.toBe(true);
        await expect(store.createRun(makeRun('r1', { thread: 'second' }))).resolves.toBe(false);
        expect((await store.getRun('r1'))!.thread).toBe('first');
        await expect(store.getRun('missing')).resolves.toBeUndefined();
    });

    it('updateRun clears columns for keys set to undefined and keeps absent ones', async () => {
        await store.createRun(makeRun('r1', {
            status: 'waiting',
            thread: 'th',
            error: { code: 'X', message: 'm' },
            waiting: {
                kind: 'approval',
                approvalId: 'ap1',
                toolName: 'tool',
                input: null,
                expiresAt: new Date(50_000),
                tokenId: 'tok',
            },
        }));
        await store.claimRun('r1', 'o1', 1_000);

        const updated = await store.updateRun('r1', {
            waiting: undefined,
            error: undefined,
            claim: undefined,
            status: 'queued',
        });
        const got = await store.getRun('r1');
        for (const run of [updated, got!]) {
            expect(Object.keys(run)).not.toContain('waiting');
            expect(Object.keys(run)).not.toContain('error');
            expect(Object.keys(run)).not.toContain('claim');
            expect(run.status).toBe('queued');
            expect(run.thread).toBe('th');
            expect(run.usage).toEqual({ inputTokens: 1, outputTokens: 2 });
        }
    });

    it('updateRun guard has one winner under concurrency', async () => {
        await store.createRun(makeRun('r1'));
        const results = await Promise.allSettled(Array.from(
            { length: 10 },
            () => store.updateRun('r1', { status: 'running' }, { expectStatus: ['queued'] }),
        ));
        const fulfilled = results.filter((r) => r.status === 'fulfilled');
        const rejected = results.filter((r) => r.status === 'rejected');
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(9);
        for (const r of rejected) {
            expect((r as PromiseRejectedResult).reason).toBeInstanceOf(InvalidRunStateError);
        }
    });

    it('updateRun reports a missing run and a foreign owner', async () => {
        await expect(store.updateRun('missing', { thread: 'x' })).rejects.toBeInstanceOf(RunNotFoundError);
        await store.createRun(makeRun('r1'));
        await store.claimRun('r1', 'o1', 1_000);
        await expect(store.updateRun('r1', { thread: 'x' }, { expectOwner: 'o2' })).rejects.toBeInstanceOf(InvalidRunStateError);
        await expect(store.updateRun('r1', { thread: 'x' }, { expectOwner: 'o1', expectStatus: ['queued'] }))
            .resolves.toMatchObject({ thread: 'x' });
    });

    it('updateRun sets updatedAt from the clock unless the patch has one', async () => {
        await store.createRun(makeRun('r1'));
        clock.advance(500);
        const a = await store.updateRun('r1', { thread: 'x' });
        expect(a.updatedAt.getTime()).toBe(10_500);
        const b = await store.updateRun('r1', { updatedAt: new Date(42) });
        expect(b.updatedAt.getTime()).toBe(42);
        expect((await store.getRun('r1'))!.updatedAt.getTime()).toBe(42);
    });

    it('listRuns with an empty status list matches nothing', async () => {
        await store.createRun(makeRun('r1'));
        await expect(store.listRuns({ status: [] })).resolves.toEqual({ data: [], total: 0 });
    });

    it('listRuns total ignores an offset past the end', async () => {
        await store.createRun(makeRun('r1'));
        await store.createRun(makeRun('r2'));
        await expect(store.listRuns({ offset: 5 })).resolves.toEqual({ data: [], total: 2 });
    });
});
