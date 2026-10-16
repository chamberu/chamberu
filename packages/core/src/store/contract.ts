import { describe, expect, it } from 'vitest';
import { ControllableClock } from '../clock.ts';
import { InvalidRunStateError, RunNotFoundError } from '../errors.ts';
import type { Checkpoint, Run, Step } from '../run/types.ts';
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
 */
export function describeStoreContract(
    create: (clock: ControllableClock) => Store | Promise<Store>,
): void {
    const setup = async () => {
        const clock = new ControllableClock();
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
            const winner = results.find((r) => r.created)!;
            expect(winner.runId).toMatch(/^run-\d+$/);
            expect(results.every((r) => r.runId === winner.runId)).toBe(true);
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

        it('saveCheckpoint with an equal stepIndex replaces the latest', async () => {
            const { store } = await setup();
            const at = new Date(1_000);
            await store.saveCheckpoint({
                runId: 'r1',
                stepIndex: 2,
                messages: [],
                createdAt: at,
            });
            await store.saveCheckpoint({
                runId: 'r1',
                stepIndex: 2,
                messages: [{ role: 'user', content: 'again' }],
                createdAt: at,
            });
            expect((await store.latestCheckpoint('r1'))?.messages).toEqual([{ role: 'user', content: 'again' }]);
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
            await store.putEffect('e2', null);
            expect(await store.getEffect('e2')).toEqual({ result: null });
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

        it('claimRun is atomic under concurrency', async () => {
            const { store } = await setup();
            await store.createRun(makeRun('r1'));
            const results = await Promise.all(
                Array.from({ length: 20 }, (_, i) => store.claimRun('r1', `w${i}`, 1_000)),
            );
            expect(results.filter(Boolean)).toHaveLength(1);
        });

        it('acquire is atomic under concurrency', async () => {
            const { store } = await setup();
            const results = await Promise.all(
                Array.from({ length: 20 }, (_, i) => store.acquire('k', `o${i}`, 1_000)),
            );
            expect(results.filter(Boolean)).toHaveLength(1);
        });

        it('lock expires after ttl and can be taken over', async () => {
            const { store, clock } = await setup();
            expect(await store.acquire('k', 'a', 1_000)).toBe(true);
            clock.advance(999);
            expect(await store.acquire('k', 'b', 1_000)).toBe(false);
            clock.advance(1);
            expect(await store.acquire('k', 'b', 1_000)).toBe(true);
            await store.release('k', 'a');
            expect(await store.acquire('k', 'c', 1_000)).toBe(false);
        });

        it('expiry boundary: exactly at expiresAt counts as expired', async () => {
            const { store, clock } = await setup();
            await store.createRun(makeRun('r1'));
            expect(await store.claimRun('r1', 'w1', 1_000)).toBe(true);
            await store.claimKey('s', 'k', 'run-1', 1_000);
            clock.advance(999);
            expect(await store.claimRun('r1', 'w2', 1_000)).toBe(false);
            expect((await store.claimKey('s', 'k', 'run-2', 1_000)).created).toBe(false);
            clock.advance(1);
            expect(await store.renewClaim('r1', 'w1', 1_000)).toBe(false);
            expect(await store.claimRun('r1', 'w2', 1_000)).toBe(true);
            expect((await store.claimKey('s', 'k', 'run-2', 1_000)).created).toBe(true);
        });

        it('updateRun on a missing run throws RunNotFoundError', async () => {
            const { store } = await setup();
            await expect(store.updateRun('nope', { status: 'running' })).rejects.toBeInstanceOf(RunNotFoundError);
        });

        it('claimRun and renewClaim on a missing run return false', async () => {
            const { store } = await setup();
            expect(await store.claimRun('nope', 'w', 1_000)).toBe(false);
            expect(await store.renewClaim('nope', 'w', 1_000)).toBe(false);
        });

        it('updateRun accepts several allowed statuses', async () => {
            const { store } = await setup();
            await store.createRun(makeRun('r1', { status: 'waiting' }));
            const run = await store.updateRun('r1', { status: 'running' }, { expectStatus: ['queued', 'waiting'] });
            expect(run.status).toBe('running');
            await expect(
                store.updateRun('r1', { status: 'failed' }, { expectStatus: ['queued', 'waiting'] }),
            ).rejects.toBeInstanceOf(InvalidRunStateError);
        });

        it('updateRun enforces expectOwner against the current claim', async () => {
            const { store, clock } = await setup();
            await store.createRun(makeRun('r1', { status: 'running' }));
            await expect(
                store.updateRun('r1', { status: 'completed' }, { expectOwner: 'w1' }),
            ).rejects.toBeInstanceOf(InvalidRunStateError);
            expect(await store.claimRun('r1', 'w1', 1_000)).toBe(true);
            await expect(
                store.updateRun('r1', { status: 'completed' }, { expectOwner: 'w2' }),
            ).rejects.toBeInstanceOf(InvalidRunStateError);
            clock.advance(1_001);
            expect(await store.claimRun('r1', 'w2', 1_000)).toBe(true);
            await expect(
                store.updateRun('r1', { status: 'completed' }, { expectStatus: ['running'], expectOwner: 'w1' }),
            ).rejects.toBeInstanceOf(InvalidRunStateError);
            expect((await store.getRun('r1'))?.status).toBe('running');
            const updated = await store.updateRun(
                'r1',
                { status: 'completed', claim: undefined },
                { expectStatus: ['running'], expectOwner: 'w2' },
            );
            expect(updated.status).toBe('completed');
            expect(updated.claim).toBeUndefined();
        });

        it('updateRun preserves untouched fields and does not clobber claim', async () => {
            const { store } = await setup();
            await store.createRun(makeRun('r1', {
                concurrencyKey: 'k', 
                thread: 't', 
                usage: { inputTokens: 3, outputTokens: 4 }, 
            }));
            await store.claimRun('r1', 'w1', 1_000);
            const before = await store.getRun('r1');
            const updated = await store.updateRun('r1', { status: 'running' });
            expect(updated.claim).toEqual(before?.claim);
            expect(updated.concurrencyKey).toBe('k');
            expect(updated.thread).toBe('t');
            expect(updated.usage).toEqual({ inputTokens: 3, outputTokens: 4 });
            expect(updated.agent).toBe('a');
            expect(updated.createdAt).toEqual(before?.createdAt);
            expect((await store.getRun('r1'))?.claim).toEqual(before?.claim);
        });

        it('listRuns breaks createdAt ties by id ascending', async () => {
            const { store } = await setup();
            for (const id of ['b', 'c', 'a']) {
                await store.createRun(makeRun(id));
            }
            expect((await store.listRuns({})).data.map((r) => r.id)).toEqual(['a', 'b', 'c']);
        });

        it('createRun inserts only when the id is absent, also under concurrency', async () => {
            const { store } = await setup();
            const results = await Promise.all(
                Array.from({ length: 5 }, (_, i) => store.createRun(makeRun('r1', { thread: `t${i}` }))),
            );
            expect(results.filter(Boolean)).toHaveLength(1);
            const winner = results.indexOf(true);
            expect((await store.getRun('r1'))?.thread).toBe(`t${winner}`);
            await store.updateRun('r1', { status: 'running' });
            expect(await store.createRun(makeRun('r1'))).toBe(false);
            expect((await store.getRun('r1'))?.status).toBe('running');
            expect((await store.listRuns({})).total).toBe(1);
        });

        it('does not alias values passed in or returned', async () => {
            const { store } = await setup();
            const at = new Date(1_000);

            // run
            const run = makeRun('r1');
            await store.createRun(run);
            run.usage.inputTokens = 99;
            run.trigger.payload = { changed: true };
            const got = (await store.getRun('r1'))!;
            expect(got.usage.inputTokens).toBe(0);
            expect(got.trigger.payload).toEqual({});
            got.usage.inputTokens = 77;
            expect((await store.getRun('r1'))?.usage.inputTokens).toBe(0);
            await store.claimRun('r1', 'w', 1_000);
            const claimed = (await store.getRun('r1'))!;
            claimed.claim!.owner = 'evil';
            expect((await store.getRun('r1'))?.claim?.owner).toBe('w');

            // checkpoint
            const messages = [{ role: 'user', content: 'hi' }] as Checkpoint['messages'];
            await store.saveCheckpoint({
                runId: 'r1', 
                stepIndex: 1, 
                messages, 
                createdAt: at, 
            });
            messages.push({ role: 'user', content: 'later' });
            const cp = (await store.latestCheckpoint('r1'))!;
            expect(cp.messages).toHaveLength(1);
            cp.messages.push({ role: 'user', content: 'x' });
            expect((await store.latestCheckpoint('r1'))?.messages).toHaveLength(1);

            // step
            const step: Step = {
                runId: 'r1', 
                index: 0, 
                kind: 'tool', 
                input: { a: 1 }, 
                startedAt: at, 
                finishedAt: at, 
            };
            await store.appendStep(step);
            (step.input as { a: number }).a = 2;
            const steps = await store.listSteps('r1');
            expect(steps[0]!.input).toEqual({ a: 1 });
            (steps[0]!.input as { a: number }).a = 3;
            expect((await store.listSteps('r1'))[0]!.input).toEqual({ a: 1 });

            // effect
            const result = { list: [1] };
            await store.putEffect('e', result);
            result.list.push(2);
            const effect = (await store.getEffect('e'))!;
            expect(effect.result).toEqual({ list: [1] });
            (effect.result as { list: number[] }).list.push(3);
            expect(await store.getEffect('e')).toEqual({ result: { list: [1] } });

            // doc
            const doc = { n: [1] };
            await store.docUpsert('a', 'c', '1', doc);
            doc.n.push(2);
            const docs = await store.docList('a', 'c');
            expect(docs[0]!.doc).toEqual({ n: [1] });
            (docs[0]!.doc as { n: number[] }).n.push(3);
            expect((await store.docList('a', 'c'))[0]!.doc).toEqual({ n: [1] });

            // kv
            const value = { n: [1] };
            await store.kvSet('a', 'k', value);
            value.n.push(2);
            const stored = (await store.kvGet('a', 'k')) as { n: number[] };
            expect(stored).toEqual({ n: [1] });
            stored.n.push(3);
            expect(await store.kvGet('a', 'k')).toEqual({ n: [1] });
        });
    });
}
