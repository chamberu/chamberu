import { tool } from 'ai';
import type { LanguageModel, ModelMessage } from 'ai';
import {
    afterEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import { z } from 'zod';
import {
    InvalidAgentDefinitionError,
    InvalidResumeTokenError,
    InvalidRunStateError,
    RunEngine,
    createResumeToken,
    defineAgent,
} from '@chamberu/core';
import type {
    AgentDefinition,
    Notification,
    Notifier,
    RunEngineOptions,
} from '@chamberu/core';
import { ControllableClock } from '../../../src/clock.ts';
import { MemoryStore } from '../../../src/store/memory.ts';
import { mockModel } from '../../utils/mock-model.ts';
import type { MockPart, MockResponse } from '../../utils/mock-model.ts';

const engines: RunEngine[] = [];

afterEach(() => {
    for (const e of engines) e.stop();
    engines.length = 0;
});

const SECRET = 'resume-secret';
const TIMEOUT = 60 * 60 * 1000;

const deployTurn = (env = 'prod', toolCallId?: string): MockResponse => ({
    parts: [{
        type: 'tool-call',
        toolName: 'deploy',
        input: { env },
        toolCallId,
    }],
});

const call = (env: string, toolCallId: string): MockPart => ({
    type: 'tool-call',
    toolName: 'deploy',
    input: { env },
    toolCallId,
});

const text = (t: string): MockResponse => ({ parts: [{ type: 'text', text: t }] });

class RecordingNotifier implements Notifier {
    readonly name = 'owner';

    calls: Array<{ n: Notification; opts: { idempotencyKey: string } }> = [];

    fail = false;

    async notify(n: Notification, opts: { idempotencyKey: string }): Promise<void> {
        this.calls.push({ n, opts });
        if (this.fail) throw new Error('notifier down');
    }
}

interface Setup {
    model: LanguageModel;
    approvals?: AgentDefinition['approvals'];
    engine?: Partial<RunEngineOptions>;
}

function setup(s: Setup) {
    const clock = new ControllableClock(new Date(1_000_000));
    const store = new MemoryStore({ clock });
    const notifier = new RecordingNotifier();
    const executed: unknown[] = [];
    const deploy = tool({
        inputSchema: z.object({ env: z.string() }),
        execute: async (input) => {
            executed.push(input);
            return `deployed ${input.env}`;
        },
    });
    const agent = defineAgent({
        name: 'release',
        instructions: 'You release.',
        model: s.model,
        tools: () => ({ deploy }),
        approvals: s.approvals ?? { deploy: 'user' },
        approvalTimeoutMs: TIMEOUT,
        notify: 'owner',
    });
    const errors: unknown[] = [];
    const engine = new RunEngine({
        store,
        agents: [agent],
        notifiers: { owner: notifier },
        resumeSecret: SECRET,
        clock,
        claimTtlMs: 30,
        onError: (error) => {
            errors.push(error);
        },
        ...s.engine,
    });
    engines.push(engine);
    return {
        clock,
        store,
        notifier,
        executed,
        engine,
        errors,
    };
}

type Ctx = ReturnType<typeof setup>;

const env = (concurrencyKey?: string) => ({
    agent: 'release',
    trigger: 'manual',
    source: 'manual' as const,
    payload: {},
    concurrencyKey,
});

async function dispatchToWaiting(ctx: Ctx, key?: string) {
    await ctx.engine.start();
    const { runId } = await ctx.engine.dispatch(env(key));
    await ctx.engine.idle();
    const run = await ctx.store.getRun(runId);
    return { runId, run };
}

/** Advances past one poll interval (claimTtlMs/3) and waits until the engine settled. */
async function poll(ctx: Ctx, ms = 10) {
    ctx.clock.advance(ms);
    await ctx.engine.idle();
}

const tokenOf = (ctx: Ctx, i = 0) => ctx.notifier.calls[i]!.n.resumeToken!;

const promptOf = (model: ReturnType<typeof mockModel>, i: number) => JSON.stringify(model.doGenerateCalls[i]?.prompt);

describe('approvals', () => {
    it('tool requiring approval puts run in waiting and notifies once', async () => {
        const model = mockModel([deployTurn(), text('done')]);
        const ctx = setup({ model });
        const { runId, run } = await dispatchToWaiting(ctx);

        expect(run?.status).toBe('waiting');
        expect(run?.claim).toBeUndefined();
        expect(run?.finishedAt).toBeUndefined();
        expect(run?.waiting).toMatchObject({
            kind: 'approval',
            toolName: 'deploy',
            input: { env: 'prod' },
            expiresAt: new Date(1_000_000 + TIMEOUT),
        });
        expect(ctx.executed).toEqual([]);
        const { approvalId, tokenId } = run!.waiting!;
        expect(typeof approvalId).toBe('string');
        expect(tokenId).toMatch(/^[0-9a-f-]{36}$/);

        expect(ctx.notifier.calls).toHaveLength(1);
        const [{ n, opts }] = ctx.notifier.calls as [RecordingNotifier['calls'][number]];
        expect(opts).toEqual({ idempotencyKey: `${runId}:${approvalId}` });
        expect(n).toMatchObject({
            kind: 'approval',
            agent: 'release',
            runId,
            expiresAt: new Date(1_000_000 + TIMEOUT),
        });
        expect(n.title).toContain('deploy');
        expect(n.body).toContain('prod');
        expect(typeof n.resumeToken).toBe('string');

        // re-process the waiting run twice (as a crash recovery would): it pauses on
        // the same approval from its checkpoint, without another model call or notification
        for (let i = 0; i < 2; i++) {
            await ctx.store.updateRun(runId, { status: 'queued' }, { expectStatus: ['waiting'] });
            await poll(ctx);
            const again = await ctx.store.getRun(runId);
            expect(again?.status).toBe('waiting');
            expect(again?.waiting).toEqual(run?.waiting);
        }
        expect(model.doGenerateCalls).toHaveLength(1);
        expect(ctx.notifier.calls).toHaveLength(1);

        // the token sent first still resumes the run
        await ctx.engine.resume(tokenOf(ctx), { approved: true });
        await ctx.engine.idle();
        expect((await ctx.store.getRun(runId))?.status).toBe('completed');
    });

    it('approved resume executes the tool and completes', async () => {
        const model = mockModel([deployTurn(), text('done')]);
        const ctx = setup({ model });
        const { runId, run } = await dispatchToWaiting(ctx);

        await ctx.engine.resume(tokenOf(ctx), { approved: true, reason: 'go' });
        await ctx.engine.idle();

        const done = await ctx.store.getRun(runId);
        expect(done?.status).toBe('completed');
        expect(done?.output).toBe('done');
        expect(done?.waiting).toBeUndefined();
        expect(ctx.executed).toEqual([{ env: 'prod' }]);
        expect(promptOf(model, 1)).toContain('deployed prod');

        const { messages } = (await ctx.store.latestCheckpoint(runId))!;
        expect(messages).toContainEqual({
            role: 'tool',
            content: [{
                type: 'tool-approval-response',
                approvalId: run!.waiting!.approvalId,
                approved: true,
                reason: 'go',
            }],
        });
        // the tool result of the approved call is part of the checkpoint
        expect(JSON.stringify(messages)).toContain('deployed prod');

        const steps = await ctx.store.listSteps(runId);
        expect(steps.map((s) => s.kind)).toEqual(['llm', 'wait', 'tool', 'llm']);
        expect(steps[1]).toMatchObject({
            name: 'deploy',
            input: { env: 'prod' },
            output: {
                approvalId: run!.waiting!.approvalId,
                approved: true,
                reason: 'go',
            },
        });
        expect(steps.map((s) => s.index)).toEqual([0, 1, 2, 3]);
    });

    it('denied resume completes without executing the tool', async () => {
        const model = mockModel([deployTurn(), text('ok, not deploying')]);
        const ctx = setup({ model });
        const { runId } = await dispatchToWaiting(ctx);

        await ctx.engine.resume(tokenOf(ctx), { approved: false, reason: 'not today' });
        await ctx.engine.idle();

        const done = await ctx.store.getRun(runId);
        expect(done?.status).toBe('completed');
        expect(done?.output).toBe('ok, not deploying');
        expect(ctx.executed).toEqual([]);
        expect(promptOf(model, 1)).toContain('not today');
    });

    it('resume is single-use', async () => {
        const model = mockModel([deployTurn(), text('done')]);
        const ctx = setup({ model });
        const { runId } = await dispatchToWaiting(ctx);
        const token = tokenOf(ctx);

        await ctx.engine.resume(token, { approved: true });
        await expect(ctx.engine.resume(token, { approved: false })).rejects.toThrow(InvalidRunStateError);
        await ctx.engine.idle();
        await expect(ctx.engine.resume(token, { approved: false })).rejects.toThrow(InvalidRunStateError);
        expect(ctx.executed).toEqual([{ env: 'prod' }]);
        expect((await ctx.store.getRun(runId))?.status).toBe('completed');
    });

    it('racing resumes: exactly one wins and only it writes the checkpoint', async () => {
        const model = mockModel([deployTurn(), text('done')]);
        const ctx = setup({ model });
        const { runId } = await dispatchToWaiting(ctx);
        const save = vi.spyOn(ctx.store, 'saveCheckpoint');
        const token = tokenOf(ctx);

        const results = await Promise.allSettled([
            ctx.engine.resume(token, { approved: true }),
            ctx.engine.resume(token, { approved: false }),
        ]);
        expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
        const rejected = results.find((r) => r.status === 'rejected');
        expect(rejected?.reason).toBeInstanceOf(InvalidRunStateError);
        // only the winner's approval checkpoint (before the run executes again)
        expect(save).toHaveBeenCalledTimes(1);
        await ctx.engine.idle();
        expect((await ctx.store.getRun(runId))?.status).toBe('completed');
        expect(ctx.executed).toEqual([{ env: 'prod' }]);
    });

    it('a resumed run is not picked up before its approval is checkpointed', async () => {
        const model = mockModel([deployTurn(), text('done')]);
        const ctx = setup({ model });
        const { runId } = await dispatchToWaiting(ctx);
        const latest = ctx.store.latestCheckpoint.bind(ctx.store);
        // a poll pass runs while resume reads the checkpoint
        vi.spyOn(ctx.store, 'latestCheckpoint').mockImplementationOnce(async (id) => {
            ctx.clock.advance(10);
            await ctx.engine.idle();
            expect((await ctx.store.getRun(id))?.status).toBe('queued');
            return latest(id);
        });

        await ctx.engine.resume(tokenOf(ctx), { approved: true });
        await ctx.engine.idle();
        expect((await ctx.store.getRun(runId))?.status).toBe('completed');
        expect(ctx.executed).toEqual([{ env: 'prod' }]);
        expect(model.doGenerateCalls).toHaveLength(2);
    });

    it('resume rejects tampered token', async () => {
        const ctx = setup({ model: mockModel([deployTurn(), text('done')]) });
        const { runId, run } = await dispatchToWaiting(ctx);
        const token = tokenOf(ctx);
        const [payload, signature] = token.split('.') as [string, string];

        const flipped = `${payload}.${signature.startsWith('A') ? 'B' : 'A'}${signature.slice(1)}`;
        await expect(ctx.engine.resume(flipped, { approved: true })).rejects.toThrow(InvalidResumeTokenError);
        await expect(ctx.engine.resume('garbage', { approved: true })).rejects.toThrow(InvalidResumeTokenError);

        // validly signed, but not the token of the current wait point
        const stale = createResumeToken(SECRET, {
            runId,
            approvalId: run!.waiting!.approvalId,
            tokenId: 'another-token',
            expiresAt: run!.waiting!.expiresAt,
        });
        await expect(ctx.engine.resume(stale, { approved: true })).rejects.toThrow(InvalidResumeTokenError);

        // signed with another secret
        const foreign = createResumeToken('other', {
            runId,
            approvalId: run!.waiting!.approvalId,
            tokenId: run!.waiting!.tokenId,
            expiresAt: run!.waiting!.expiresAt,
        });
        await expect(ctx.engine.resume(foreign, { approved: true })).rejects.toThrow(InvalidResumeTokenError);

        expect((await ctx.store.getRun(runId))?.status).toBe('waiting');
        expect(ctx.executed).toEqual([]);
    });

    it('resume rejects expired token', async () => {
        const ctx = setup({ model: mockModel([deployTurn(), text('done')]) });
        const { runId } = await dispatchToWaiting(ctx);
        ctx.engine.stop();
        ctx.clock.advance(TIMEOUT);

        await expect(ctx.engine.resume(tokenOf(ctx), { approved: true })).rejects.toThrow(InvalidResumeTokenError);
        expect((await ctx.store.getRun(runId))?.status).toBe('waiting');
    });

    it('tick denies expired approvals', async () => {
        const model = mockModel([deployTurn(), text('timed out, skipping')]);
        const ctx = setup({ model });
        const { runId } = await dispatchToWaiting(ctx);
        ctx.engine.stop();

        ctx.clock.advance(TIMEOUT - 1);
        await ctx.engine.tick();
        expect((await ctx.store.getRun(runId))?.status).toBe('waiting');

        ctx.clock.advance(1);
        await ctx.engine.tick();
        await ctx.engine.start();
        await ctx.engine.idle();

        const done = await ctx.store.getRun(runId);
        expect(done?.status).toBe('completed');
        expect(ctx.executed).toEqual([]);
        expect(promptOf(model, 1)).toContain('approval timed out');
        const steps = await ctx.store.listSteps(runId);
        expect(steps.find((s) => s.kind === 'wait')?.output).toMatchObject({ approved: false, reason: 'approval timed out' });
    });

    it('the poll loop expires approvals without a caller', async () => {
        const model = mockModel([deployTurn(), text('timed out')]);
        const ctx = setup({ model });
        const { runId } = await dispatchToWaiting(ctx);

        await poll(ctx, TIMEOUT);
        expect((await ctx.store.getRun(runId))?.status).toBe('completed');
        expect(ctx.executed).toEqual([]);
    });

    it('waiting run blocks its concurrencyKey', async () => {
        const model = mockModel([deployTurn(), text('a done'), text('b done')]);
        const ctx = setup({ model });
        const { runId: a } = await dispatchToWaiting(ctx, 'repo-1');
        const { runId: b } = await ctx.engine.dispatch(env('repo-1'));
        await ctx.engine.idle();
        await poll(ctx);
        expect((await ctx.store.getRun(a))?.status).toBe('waiting');
        expect((await ctx.store.getRun(b))?.status).toBe('queued');

        await ctx.engine.resume(tokenOf(ctx), { approved: true });
        await ctx.engine.idle();
        expect((await ctx.store.getRun(a))).toMatchObject({ status: 'completed', output: 'a done' });
        expect((await ctx.store.getRun(b))).toMatchObject({ status: 'completed', output: 'b done' });
    });

    it('a waiting run frees its concurrency slot', async () => {
        const model = mockModel([deployTurn(), text('other done')]);
        const ctx = setup({ model, engine: { maxConcurrentRuns: 1 } });
        await dispatchToWaiting(ctx);
        const { runId } = await ctx.engine.dispatch(env());
        await ctx.engine.idle();
        expect((await ctx.store.getRun(runId))?.status).toBe('completed');
    });

    it('a failing notifier is reported and the run still waits', async () => {
        const ctx = setup({ model: mockModel([deployTurn(), text('done')]) });
        ctx.notifier.fail = true;
        const { run } = await dispatchToWaiting(ctx);
        expect(run?.status).toBe('waiting');
        expect(ctx.notifier.calls).toHaveLength(1);
        expect(ctx.errors).toHaveLength(1);
        expect(String(ctx.errors[0])).toContain('notifier down');
    });

    it('an agent naming an unknown notifier is rejected', () => {
        const agent = defineAgent({
            name: 'release',
            instructions: '',
            model: mockModel([]),
            notify: 'nobody',
        });
        expect(() => new RunEngine({
            store: new MemoryStore(),
            agents: [agent],
            resumeSecret: SECRET,
        })).toThrow(InvalidAgentDefinitionError);
    });

    it('approval policies map allow, deny and user', async () => {
        const seen: unknown[] = [];
        const model = mockModel([
            {
                parts: [
                    call('dev', 'c1'),
                    call('stage', 'c2'),
                    call('prod', 'c3'),
                ],
            },
            text('done'),
        ]);
        const ctx = setup({
            model,
            approvals: {
                deploy: (input, { runtimeContext }) => {
                    seen.push(runtimeContext.runId);
                    const { env: target } = input as { env: string };
                    if (target === 'dev') return 'allow';
                    if (target === 'stage') return 'deny';
                    return 'user';
                },
            },
        });
        const { runId, run } = await dispatchToWaiting(ctx);
        expect(seen).toEqual([runId, runId, runId]);
        expect(ctx.executed).toEqual([{ env: 'dev' }]);
        expect(run?.waiting).toMatchObject({ toolName: 'deploy', input: { env: 'prod' } });

        await ctx.engine.resume(tokenOf(ctx), { approved: true });
        await ctx.engine.idle();
        expect(ctx.executed).toEqual([{ env: 'dev' }, { env: 'prod' }]);
        expect((await ctx.store.getRun(runId))?.status).toBe('completed');
    });

    it('several approval requests in one step pause on the first; the model re-requests the rest', async () => {
        const model = mockModel([
            {
                parts: [
                    call('prod', 'c1'),
                    call('eu', 'c2'),
                ],
            },
            deployTurn('eu', 'c3'),
            text('both done'),
        ]);
        const ctx = setup({ model });
        const { runId, run } = await dispatchToWaiting(ctx);
        expect(run?.waiting).toMatchObject({ input: { env: 'prod' } });

        // the unanswered call is not part of the history
        const { messages }: { messages: ModelMessage[] } = (await ctx.store.latestCheckpoint(runId))!;
        expect(JSON.stringify(messages)).not.toContain('c2');

        await ctx.engine.resume(tokenOf(ctx), { approved: true });
        await ctx.engine.idle();
        expect(promptOf(model, 1)).not.toContain('c2');
        const second = await ctx.store.getRun(runId);
        expect(second?.status).toBe('waiting');
        expect(second?.waiting).toMatchObject({ input: { env: 'eu' } });
        expect(ctx.notifier.calls).toHaveLength(2);

        await ctx.engine.resume(tokenOf(ctx, 1), { approved: true });
        await ctx.engine.idle();
        expect(ctx.executed).toEqual([{ env: 'prod' }, { env: 'eu' }]);
        expect((await ctx.store.getRun(runId))?.output).toBe('both done');
    });

    it('a waiting run can be cancelled, which unblocks its key and voids the token', async () => {
        const model = mockModel([deployTurn(), text('b done')]);
        const ctx = setup({ model });
        const { runId: a } = await dispatchToWaiting(ctx, 'repo-1');
        const { runId: b } = await ctx.engine.dispatch(env('repo-1'));
        await ctx.engine.idle();

        await ctx.engine.cancel(a);
        const cancelled = await ctx.store.getRun(a);
        expect(cancelled).toMatchObject({ status: 'cancelled', waiting: undefined });
        await expect(ctx.engine.resume(tokenOf(ctx), { approved: true })).rejects.toThrow(InvalidRunStateError);
        await poll(ctx);
        expect((await ctx.store.getRun(b))?.status).toBe('completed');
        expect(ctx.executed).toEqual([]);
    });

    it('resume of an unknown run fails', async () => {
        const ctx = setup({ model: mockModel([]) });
        const token = createResumeToken(SECRET, {
            runId: 'nope',
            approvalId: 'a',
            tokenId: 't',
            expiresAt: new Date(2_000_000),
        });
        await expect(ctx.engine.resume(token, { approved: true })).rejects.toThrow(/was not found/);
    });
});
