import { describe, expect, it } from 'vitest';
import { ControllableClock } from '../clock.ts';
import { InvalidRunStateError } from '../errors.ts';
import type { Run } from '../run/types.ts';
import type { Store } from './types.ts';

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
            payload: {},
            receivedAt: createdAt,
        },
        usage: { inputTokens: 0, outputTokens: 0 },
        createdAt,
        updatedAt: createdAt,
        ...overrides,
    };
}

/**
 * Shared behavioural contract for every Store implementation.
 *
 * @param create Factory for a fresh, empty store. It MUST use the given clock for all
 *               TTL/expiry decisions (e.g. `(clock) => new MemoryStore({ clock })`).
 * @param opts.clock Optional clock to drive; a new ControllableClock is created per test otherwise.
 */
export function describeStoreContract(
    create: (clock: ControllableClock) => Store | Promise<Store>,
    opts: { clock?: ControllableClock } = {},
): void {
    const setup = async () => {
        const clock = opts.clock ?? new ControllableClock();
        const store = await create(clock);
        return { clock, store };
    };

    describe('store contract', () => {
        it('claimKey is atomic under concurrency', async () => {
            const { store } = await setup();
            const results = await Promise.all(
                Array.from({ length: 20 }, (_, i) => store.claimKey('github', 'd1', `run-${i}`, 60_000)),
            );
            expect(results.filter((r) => r.created)).toHaveLength(1);
            expect(new Set(results.map((r) => r.runId)).size).toBe(1);
        });

        it('claimKey expires after ttl', async () => {
            const { store, clock } = await setup();
            const first = await store.claimKey('github', 'd1', 'run-1', 1_000);
            expect(first).toEqual({ created: true, runId: 'run-1' });
            expect(await store.claimKey('github', 'd1', 'run-2', 1_000)).toEqual({ created: false, runId: 'run-1' });
            clock.advance(1_001);
            expect(await store.claimKey('github', 'd1', 'run-2', 1_000)).toEqual({ created: true, runId: 'run-2' });
        });

        it('updateRun enforces expectStatus', async () => {
            const { store } = await setup();
            await store.createRun(makeRun('r1'));
            await expect(
                store.updateRun('r1', { status: 'running' }, { expectStatus: ['waiting'] }),
            ).rejects.toBeInstanceOf(InvalidRunStateError);
            expect((await store.getRun('r1'))?.status).toBe('queued');
            const updated = await store.updateRun('r1', { status: 'running' }, { expectStatus: ['queued'] });
            expect(updated.status).toBe('running');
            expect((await store.getRun('r1'))?.status).toBe('running');
        });

        it('claimRun grants a single owner until expiry', async () => {
            const { store, clock } = await setup();
            await store.createRun(makeRun('r1'));
            expect(await store.claimRun('r1', 'w1', 1_000)).toBe(true);
            expect(await store.claimRun('r1', 'w2', 1_000)).toBe(false);
            clock.advance(500);
            expect(await store.renewClaim('r1', 'w1', 1_000)).toBe(true);
            expect(await store.renewClaim('r1', 'w2', 1_000)).toBe(false);
            clock.advance(700);
            expect(await store.claimRun('r1', 'w2', 1_000)).toBe(false);
        });

        it('claimRun can be taken over after expiry', async () => {
            const { store, clock } = await setup();
            await store.createRun(makeRun('r1'));
            expect(await store.claimRun('r1', 'w1', 1_000)).toBe(true);
            clock.advance(1_001);
            expect(await store.renewClaim('r1', 'w1', 1_000)).toBe(false);
            expect(await store.claimRun('r1', 'w2', 1_000)).toBe(true);
            expect((await store.getRun('r1'))?.claim?.owner).toBe('w2');
        });

        it('latestCheckpoint returns highest stepIndex', async () => {
            const { store } = await setup();
            expect(await store.latestCheckpoint('r1')).toBeUndefined();
            const at = new Date(1_000);
            await store.saveCheckpoint({
                runId: 'r1', 
                stepIndex: 2, 
                messages: [], 
                createdAt: at, 
            });
            await store.saveCheckpoint({
                runId: 'r1', 
                stepIndex: 5, 
                messages: [], 
                createdAt: at, 
            });
            await store.saveCheckpoint({
                runId: 'r1', 
                stepIndex: 3, 
                messages: [], 
                createdAt: at, 
            });
            await store.saveCheckpoint({
                runId: 'r2', 
                stepIndex: 9, 
                messages: [], 
                createdAt: at, 
            });
            expect((await store.latestCheckpoint('r1'))?.stepIndex).toBe(5);
        });

        it('lock acquire is exclusive and released by owner only', async () => {
            const { store } = await setup();
            expect(await store.acquire('k', 'a', 1_000)).toBe(true);
            expect(await store.acquire('k', 'b', 1_000)).toBe(false);
            await store.release('k', 'b');
            expect(await store.acquire('k', 'b', 1_000)).toBe(false);
            await store.release('k', 'a');
            expect(await store.acquire('k', 'b', 1_000)).toBe(true);
        });

        it('effect roundtrip', async () => {
            const { store } = await setup();
            expect(await store.getEffect('e1')).toBeUndefined();
            await store.putEffect('e1', { ok: true });
            expect(await store.getEffect('e1')).toEqual({ result: { ok: true } });
            await store.putEffect('e2', undefined);
            expect(await store.getEffect('e2')).toEqual({ result: undefined });
        });

        it('state kv and docs roundtrip, docList where filters by top-level equality', async () => {
            const { store } = await setup();
            expect(await store.kvGet('a', 'k')).toBeUndefined();
            await store.kvSet('a', 'k', { n: 1 });
            expect(await store.kvGet('a', 'k')).toEqual({ n: 1 });
            expect(await store.kvGet('b', 'k')).toBeUndefined();

            await store.docUpsert('a', 'todos', '1', { title: 'x', done: false });
            await store.docUpsert('a', 'todos', '2', { title: 'y', done: true });
            await store.docUpsert('a', 'todos', '3', { title: 'z', done: true });
            await store.docUpsert('b', 'todos', '1', { title: 'other', done: true });

            expect(await store.docList('a', 'todos')).toHaveLength(3);
            const done = await store.docList('a', 'todos', { where: { done: true } });
            expect(done.map((d) => d.id).sort()).toEqual(['2', '3']);
            expect(await store.docList('a', 'todos', { where: { done: true }, limit: 1 })).toHaveLength(1);

            await store.docUpsert('a', 'todos', '1', { title: 'x2', done: true });
            expect((await store.docList('a', 'todos', { where: { title: 'x2' } })).map((d) => d.id)).toEqual(['1']);
            await store.docDelete('a', 'todos', '1');
            expect(await store.docList('a', 'todos', { where: { title: 'x2' } })).toEqual([]);
        });

        it('listRuns filters by agent, status, concurrencyKey and returns total', async () => {
            const { store } = await setup();
            await store.createRun(makeRun('r3', {
                agent: 'a', 
                status: 'running', 
                concurrencyKey: 'k1', 
                createdAt: new Date(3_000), 
            }));
            await store.createRun(makeRun('r1', {
                agent: 'a', 
                status: 'queued', 
                concurrencyKey: 'k1', 
                createdAt: new Date(1_000), 
            }));
            await store.createRun(makeRun('r2', {
                agent: 'b', 
                status: 'queued', 
                createdAt: new Date(2_000), 
            }));
            await store.createRun(makeRun('r4', {
                agent: 'a', 
                status: 'completed', 
                concurrencyKey: 'k2', 
                createdAt: new Date(4_000), 
            }));

            const all = await store.listRuns({});
            expect(all.total).toBe(4);
            expect(all.data.map((r) => r.id)).toEqual(['r1', 'r2', 'r3', 'r4']);

            expect((await store.listRuns({ agent: 'a' })).data.map((r) => r.id)).toEqual(['r1', 'r3', 'r4']);
            expect((await store.listRuns({ status: ['queued', 'running'] })).total).toBe(3);
            expect((await store.listRuns({ concurrencyKey: 'k1' })).data.map((r) => r.id)).toEqual(['r1', 'r3']);

            const page = await store.listRuns({
                agent: 'a', 
                limit: 1, 
                offset: 1, 
            });
            expect(page.total).toBe(3);
            expect(page.data.map((r) => r.id)).toEqual(['r3']);
        });
    });
}
