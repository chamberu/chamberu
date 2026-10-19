/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    afterEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import { MemoryStore, RunEngine } from '@chamberu/core';
import { ControllableClock } from '@chamberu/test-kit';
import { createShutdown } from '@chamberu/http';
import {
    ADMIN_TOKEN,
    CapturingNotifier,
    READER_TOKEN,
    call,
    createRunAgents,
    createRunTestApp,
    flush,
    tokenFor,
} from '../../utils/app.ts';
import { SseReader, readEvents } from '../../utils/sse.ts';
import type { SseEvent } from '../../utils/sse.ts';

type App = ReturnType<typeof createRunTestApp>['app'];

async function start(app: App, agent = 'echo'): Promise<string> {
    const response = await call(app, 'POST', `/agents/${agent}/runs`, { token: ADMIN_TOKEN });
    return (await response.json() as { runId: string }).runId;
}

function statusOf(event: SseEvent): string | undefined {
    return event.event === 'run.updated' ? (JSON.parse(event.data) as { status: string }).status : undefined;
}

function stepIds(events: SseEvent[]): string[] {
    return events.filter((e) => e.event === 'step.appended').map((e) => e.id!);
}

async function completedRun() {
    const ctx = createRunTestApp();
    const runId = await start(ctx.app);
    await ctx.engine.start();
    await ctx.engine.idle();
    const steps = await ctx.store.listSteps(runId);
    expect(steps.length).toBeGreaterThan(0);
    return {
        ...ctx,
        runId,
        steps,
    };
}

/** Spies on engine.on so every unsubscribe it hands out is a spy. */
function spyOnSubscriptions(engine: RunEngine) {
    const unsubscribes: Array<ReturnType<typeof vi.fn>> = [];
    const original = engine.on.bind(engine);
    const on: RunEngine['on'] = (type, listener) => {
        const unsubscribe = vi.fn(original(type, listener));
        unsubscribes.push(unsubscribe);
        return unsubscribe;
    };
    vi.spyOn(engine, 'on').mockImplementation(on);
    return unsubscribes;
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('GET /runs/:id/stream', () => {
    it('sends a settled run with its steps, then ends', async () => {
        const {
            app,
            runId,
            steps,
        } = await completedRun();
        const response = await call(app, 'GET', `/runs/${runId}/stream`, { token: READER_TOKEN });
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('text/event-stream');

        const events = await readEvents(response);
        expect(events[0]?.event).toBe('run.updated');
        expect(statusOf(events[0]!)).toBe('completed');
        expect(JSON.parse(events[0]!.data)).not.toHaveProperty('claim');
        expect(stepIds(events)).toEqual(steps.map((s) => String(s.index)));
        expect(events).toHaveLength(1 + steps.length);
    });

    it('follows a run live and ends once it settled', async () => {
        const { app, engine } = createRunTestApp();
        const runId = await start(app);
        const reader = new SseReader(await call(app, 'GET', `/runs/${runId}/stream`, { token: READER_TOKEN }));
        const [snapshot] = await reader.next(1);
        expect(statusOf(snapshot!)).toBe('queued');

        await engine.start();
        await engine.idle();
        const events = await reader.rest();
        const statuses = events.map(statusOf).filter(Boolean);
        expect(statuses).toContain('running');
        expect(statuses.at(-1)).toBe('completed');
        const ids = stepIds(events);
        expect(ids.length).toBeGreaterThan(0);
        expect(new Set(ids).size).toBe(ids.length);
        expect(reader.done).toBe(true);
    });

    it('skips the steps up to Last-Event-ID', async () => {
        const {
            app,
            runId,
            steps,
        } = await completedRun();
        const response = await call(app, 'GET', `/runs/${runId}/stream`, { token: READER_TOKEN, headers: { 'last-event-id': '0' } });
        const events = await readEvents(response);
        expect(stepIds(events)).toEqual(steps.slice(1).map((s) => String(s.index)));
    });

    it('reads a malformed Last-Event-ID as none', async () => {
        const {
            app,
            runId,
            steps,
        } = await completedRun();
        const response = await call(app, 'GET', `/runs/${runId}/stream`, { token: READER_TOKEN, headers: { 'last-event-id': 'abc' } });
        expect(stepIds(await readEvents(response))).toEqual(steps.map((s) => String(s.index)));
    });

    it('sees a run executing on another replica through the store poll', async () => {
        const clock = new ControllableClock(new Date(1_000_000));
        const store = new MemoryStore({ clock });
        const agents = createRunAgents();
        const { app } = createRunTestApp({
            clock,
            store,
            agents,
        });
        const other = new RunEngine({
            store,
            agents,
            resumeSecret: 'test-secret',
            clock,
            notifiers: { capture: new CapturingNotifier() },
            owner: 'replica-b',
            onError: () => {},
        });
        const runId = await start(app);
        const reader = new SseReader(await call(app, 'GET', `/runs/${runId}/stream`, { token: READER_TOKEN }));
        expect(statusOf((await reader.next(1))[0]!)).toBe('queued');

        await other.start();
        await other.idle();
        clock.advance(2_000);
        const events = await reader.rest();
        expect(statusOf(events[0]!)).toBe('completed');
        expect(stepIds(events)).toEqual((await store.listSteps(runId)).map((s) => String(s.index)));
        expect(reader.done).toBe(true);
        await other.drain();
    });

    it('pings an idle stream', async () => {
        const { app, clock } = createRunTestApp();
        const runId = await start(app);
        const reader = new SseReader(await call(app, 'GET', `/runs/${runId}/stream`, { token: READER_TOKEN }));
        await reader.next(1);
        clock.advance(2_000);
        const [ping] = await reader.next(1);
        expect(ping).toEqual({ event: 'ping', data: '' });
        await reader.reader.cancel();
    });

    it('reads the steps again only when the polled run changed', async () => {
        const {
            app, 
            clock, 
            store, 
        } = createRunTestApp();
        const runId = await start(app);
        const listSteps = vi.spyOn(store, 'listSteps');
        const reader = new SseReader(await call(app, 'GET', `/runs/${runId}/stream`, { token: READER_TOKEN }));
        await reader.next(1);
        for (let i = 0; i < 3; i++) {
            clock.advance(2_000);
            await reader.next(1);
        }
        expect(listSteps).toHaveBeenCalledTimes(1);

        const run = (await store.getRun(runId))!;
        await store.updateRun(runId, { updatedAt: new Date(run.updatedAt.getTime() + 1) });
        clock.advance(2_000);
        await reader.next(1);
        expect(listSteps).toHaveBeenCalledTimes(2);
        await reader.reader.cancel();
    });

    it('cleans up when the client cancels the body', async () => {
        const ctx = createRunTestApp();
        const runId = await start(ctx.app);
        const unsubscribes = spyOnSubscriptions(ctx.engine);
        const reader = new SseReader(await call(ctx.app, 'GET', `/runs/${runId}/stream`, { token: READER_TOKEN }));
        await reader.next(1);
        await reader.reader.cancel();

        const getRun = vi.spyOn(ctx.store, 'getRun');
        ctx.clock.advance(2_000);
        await flush();
        expect(unsubscribes).toHaveLength(2);
        for (const unsubscribe of unsubscribes) expect(unsubscribe).toHaveBeenCalledTimes(1);

        const calls = getRun.mock.calls.length;
        ctx.clock.advance(2_000);
        await flush();
        expect(getRun.mock.calls.length).toBe(calls);
    });

    it('cleans up at once when the request signal aborts', async () => {
        const ctx = createRunTestApp();
        const runId = await start(ctx.app);
        const unsubscribes = spyOnSubscriptions(ctx.engine);
        const controller = new AbortController();
        const reader = new SseReader(await call(ctx.app, 'GET', `/runs/${runId}/stream`, { token: READER_TOKEN, signal: controller.signal }));
        await reader.next(1);

        controller.abort();
        expect(unsubscribes).toHaveLength(2);
        for (const unsubscribe of unsubscribes) expect(unsubscribe).toHaveBeenCalledTimes(1);

        const getRun = vi.spyOn(ctx.store, 'getRun');
        ctx.clock.advance(2_000);
        await flush();
        expect(getRun).not.toHaveBeenCalled();
    });

    it.each(['failed', 'cancelled'] as const)('ends right after the snapshot of a %s run', async (status) => {
        const { app, store } = createRunTestApp();
        const runId = await start(app);
        await store.updateRun(runId, { status });
        const events = await readEvents(await call(app, 'GET', `/runs/${runId}/stream`, { token: READER_TOKEN }));
        expect(events.map(statusOf)).toEqual([status]);
    });

    it('reports a failing poll and ends the stream', async () => {
        const onError = vi.fn();
        const ctx = createRunTestApp({ onError });
        const runId = await start(ctx.app);
        const unsubscribes = spyOnSubscriptions(ctx.engine);
        const reader = new SseReader(await call(ctx.app, 'GET', `/runs/${runId}/stream`, { token: READER_TOKEN }));
        await reader.next(1);

        const failure = new Error('store down');
        vi.spyOn(ctx.store, 'getRun').mockRejectedValue(failure);
        ctx.clock.advance(2_000);
        expect(await reader.rest()).toEqual([]);
        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError).toHaveBeenCalledWith(failure);
        for (const unsubscribe of unsubscribes) expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    it('answers 500 when the snapshot fails', async () => {
        const onError = vi.fn();
        const ctx = createRunTestApp({ onError });
        const runId = await start(ctx.app);
        const unsubscribes = spyOnSubscriptions(ctx.engine);
        const failure = new Error('store down');
        vi.spyOn(ctx.store, 'listSteps').mockRejectedValueOnce(failure);

        const response = await call(ctx.app, 'GET', `/runs/${runId}/stream`, { token: READER_TOKEN });
        expect(response.status).toBe(500);
        expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
        expect(onError).toHaveBeenCalledWith(failure);
        for (const unsubscribe of unsubscribes) expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    it('answers 404 when the run is gone before the snapshot', async () => {
        const ctx = createRunTestApp();
        const runId = await start(ctx.app);
        const run = await ctx.store.getRun(runId);
        vi.spyOn(ctx.store, 'getRun').mockResolvedValueOnce(run).mockResolvedValueOnce(undefined);

        const response = await call(ctx.app, 'GET', `/runs/${runId}/stream`, { token: READER_TOKEN });
        expect(response.status).toBe(404);
    });

    it('checks the run and the permission before it streams', async () => {
        const { app } = createRunTestApp();
        const runId = await start(app);
        const missing = await call(app, 'GET', '/runs/missing/stream', { token: READER_TOKEN });
        expect(missing.status).toBe(404);
        expect(missing.headers.get('content-type')).toMatch(/application\/json/);
        expect((await call(app, 'GET', `/runs/${runId}/stream`, { token: tokenFor('agent:other:run') })).status).toBe(403);
        expect((await call(app, 'GET', `/runs/${runId}/stream`)).status).toBe(401);

        const allowed = await call(app, 'GET', `/runs/${runId}/stream`, { token: tokenFor('agent:echo:run') });
        expect(allowed.status).toBe(200);
        await allowed.body?.cancel();
    });

    it('ends open streams on shutdown', async () => {
        const clock = new ControllableClock(new Date(1_000_000));
        const store = new MemoryStore({ clock });
        const agents = createRunAgents();
        const engine = new RunEngine({
            store,
            agents,
            resumeSecret: 'test-secret',
            clock,
            notifiers: { capture: new CapturingNotifier() },
            onError: () => {},
        });
        const shutdown = createShutdown({ engine, clock });
        const { app } = createRunTestApp({
            clock,
            store,
            agents,
            engine,
            shutdown,
        });
        const runId = await start(app);
        const reader = new SseReader(await call(app, 'GET', `/runs/${runId}/stream`, { token: READER_TOKEN }));
        await reader.next(1);

        await shutdown.shutdown();
        expect(await reader.rest()).toEqual([]);
        expect(reader.done).toBe(true);

        const subscribe = vi.spyOn(engine, 'on');
        const late = await call(app, 'GET', `/runs/${runId}/stream`, { token: READER_TOKEN });
        expect(late.status).toBe(503);
        expect(subscribe).not.toHaveBeenCalled();
    });
});
