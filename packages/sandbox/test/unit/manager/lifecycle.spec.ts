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
} from 'vitest';
import {
    Engine,
    MemoryStore,
    RunStatus,
    SandboxError,
    defineAgent,
} from '@chamberu/core';
import type { AgentDefinition, Run, RunEvent } from '@chamberu/core';
import { createWorkspaceManager } from '@chamberu/sandbox';
import { ControllableClock } from '../../utils/clock.ts';
import { mockModel } from '../../utils/model.ts';
import type { MockResponse } from '../../utils/model.ts';
import { createFakeProvider } from '../../utils/provider.ts';
import type { FakeProvider } from '../../utils/provider.ts';

const engines: Engine[] = [];

afterEach(() => {
    for (const engine of engines) engine.stop();
    engines.length = 0;
});

const text = (t: string): MockResponse => ({ parts: [{ type: 'text', text: t }] });
const call = (toolName: string, input: unknown = {}): MockResponse => ({
    parts: [{
        type: 'tool-call',
        toolName,
        input,
    }],
});

type Setup = {
    script: MockResponse[];
    approvals?: AgentDefinition['approvals'];
    provider?: FakeProvider;
};

async function run(s: Setup) {
    const clock = new ControllableClock(new Date(1_000_000));
    const store = new MemoryStore({ clock });
    const provider = s.provider ?? createFakeProvider({ clock });
    const errors: unknown[] = [];
    const manager = createWorkspaceManager({
        provider,
        clock,
        gcIntervalMs: 0,
        onError: (error) => { errors.push(error); },
    });
    const agent = defineAgent({
        name: 'coder',
        instructions: 'You code.',
        model: mockModel(s.script),
        tools: manager.tools(),
        approvals: s.approvals,
    });
    const engine = new Engine({
        store,
        agents: [agent],
        resumeSecret: 'secret',
        clock,
        onError: () => {},
    });
    engines.push(engine);
    manager.attach(engine);
    await engine.start();
    const { runId } = await engine.dispatch({
        agent: 'coder',
        trigger: 'http',
        source: 'http',
        payload: {},
    });
    await engine.idle();
    return {
        provider,
        manager,
        errors,
        runId,
        run: await store.getRun(runId),
    };
}

/** An engine stand-in that records its run.updated listeners. */
function fakeEngine() {
    const listeners = new Set<(e: Extract<RunEvent, { type: 'run.updated' }>) => void>();
    return {
        listeners,
        on: ((type: string, listener: (e: Extract<RunEvent, { type: 'run.updated' }>) => void) => {
            if (type === 'run.updated') listeners.add(listener);
            return () => { listeners.delete(listener); };
        }) as Engine['on'],
        emit(run: Pick<Run, 'id' | 'status'>) {
            for (const listener of listeners) listener({ type: 'run.updated', run: run as Run });
        },
    };
}

/** Lets already-queued callbacks settle; not a sleep. */
const flush = () => new Promise<void>((resolve) => { setImmediate(resolve); });

describe('workspace manager: run lifecycle', () => {
    it('disposes when the run completes', async () => {
        const { provider, run: done } = await run({ script: [call('create_workspace'), text('done')] });
        expect(done?.status).toBe('completed');
        expect(provider.created).toHaveLength(1);
        const [id] = provider.workspaces.keys();
        expect(provider.disposed).toEqual([id]);
    });

    it('disposes when the run fails', async () => {
        // turn 2 has no script: the mock model throws
        const { provider, run: failed } = await run({ script: [call('create_workspace')] });
        expect(failed?.status).toBe('failed');
        const [id] = provider.workspaces.keys();
        expect(provider.disposed).toEqual([id]);
    });

    it('keeps the workspace while the run waits', async () => {
        const {
            provider,
            manager,
            runId,
            run: waiting,
        } = await run({
            script: [call('create_workspace'), call('dispose_workspace')],
            approvals: { dispose_workspace: 'user' },
        });
        expect(waiting?.status).toBe('waiting');
        expect(provider.disposed).toEqual([]);
        const [id] = provider.workspaces.keys();
        expect(manager.get(runId).id).toBe(id);
    });

    it('reports dispose failures', async () => {
        const provider = createFakeProvider();
        const create = provider.create.bind(provider);
        const failure = new Error('container gone');
        provider.create = async (options) => {
            const workspace = await create(options);
            workspace.dispose = async () => { throw failure; };
            return workspace;
        };
        const {
            manager,
            errors,
            runId,
        } = await run({ script: [call('create_workspace'), text('done')], provider });
        await flush();
        expect(errors).toHaveLength(1);
        expect(errors[0]).toBeInstanceOf(SandboxError);
        expect((errors[0] as SandboxError).cause).toBe(failure);
        expect(() => manager.get(runId)).toThrow(/not found|create_workspace/);
    });

    it('disposes only on completed, failed and cancelled', async () => {
        const clock = new ControllableClock(new Date(1_000_000));
        const provider = createFakeProvider({ clock });
        const manager = createWorkspaceManager({
            provider, 
            clock, 
            gcIntervalMs: 0, 
        });
        const engine = fakeEngine();
        manager.attach(engine);
        for (const status of [RunStatus.QUEUED, RunStatus.RUNNING, RunStatus.WAITING, RunStatus.INTERRUPTED]) {
            await manager.acquire('r1', {});
            engine.emit({ id: 'r1', status });
            await flush();
            expect(provider.disposed).toEqual([]);
        }
        for (const [index, status] of [RunStatus.COMPLETED, RunStatus.FAILED, RunStatus.CANCELLED].entries()) {
            await manager.acquire(`r${index + 2}`, {});
            engine.emit({ id: `r${index + 2}`, status });
            await flush();
            expect(provider.disposed).toHaveLength(index + 1);
        }
    });

    it('close() disposes everything and unsubscribes', async () => {
        const {
            provider,
            manager,
            runId,
        } = await run({
            script: [call('create_workspace'), call('dispose_workspace')],
            approvals: { dispose_workspace: 'user' },
        });
        const engine = fakeEngine();
        const unsubscribe = manager.attach(engine);
        expect(engine.listeners.size).toBe(1);
        await manager.close();
        const [id] = provider.workspaces.keys();
        expect(provider.disposed).toEqual([id]);
        expect(engine.listeners.size).toBe(0);
        expect(() => manager.get(runId)).toThrow(SandboxError);
        engine.emit({ id: runId, status: RunStatus.COMPLETED });
        await flush();
        expect(provider.disposed).toEqual([id]);
        unsubscribe();
        await expect(manager.close()).resolves.toBeUndefined();
    });

    it('subscribes nothing when attached after close()', async () => {
        const { manager } = await run({ script: [text('done')] });
        await manager.close();
        const engine = fakeEngine();
        const unsubscribe = manager.attach(engine);
        expect(engine.listeners.size).toBe(0);
        unsubscribe();
    });

    it('unsubscribes one attach', async () => {
        const { manager } = await run({ script: [text('done')] });
        const engine = fakeEngine();
        const unsubscribe = manager.attach(engine);
        unsubscribe();
        expect(engine.listeners.size).toBe(0);
    });

    it('lets a workspace tool fail as a tool error, not the run', async () => {
        const { provider, run: done } = await run({ script: [call('dispose_workspace'), text('done')] });
        expect(done?.status).toBe('completed');
        expect(provider.created).toEqual([]);
    });
});
