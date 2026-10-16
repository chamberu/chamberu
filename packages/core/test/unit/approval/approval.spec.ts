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
    FatalToolError,
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
    budget?: AgentDefinition['budget'];
    /** Replaces the deploy tool's body (after recording the call). */
    deploy?: (input: { env: string }) => Promise<string>;
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
            if (s.deploy) return s.deploy(input);
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
        budget: s.budget,
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

    it('a crash between the queued transition and the approval checkpoint keeps the original token valid', async () => {
        const model = mockModel([deployTurn(), text('done')]);
        const ctx = setup({ model });
        const { runId, run } = await dispatchToWaiting(ctx);
        const token = tokenOf(ctx);

        // the resuming process dies right after answer()'s waiting -> queued write
        vi.spyOn(ctx.store, 'latestCheckpoint').mockImplementationOnce(() => new Promise(() => {}));
        void ctx.engine.resume(token, { approved: false });
        await vi.waitFor(async () => {
            expect((await ctx.store.getRun(runId))?.status).toBe('queued');
        });
        const crashed = await ctx.store.getRun(runId);
        expect(crashed?.claim).toBeDefined();
        // the wait point survives the transition
        expect(crashed?.waiting).toEqual(run?.waiting);

        // once the dead claim expired, the run is re-executed and pauses on the same wait point
        await poll(ctx, 40);
        const again = await ctx.store.getRun(runId);
        expect(again?.status).toBe('waiting');
        expect(again?.waiting?.approvalId).toBe(run?.waiting?.approvalId);
        expect(again?.waiting?.tokenId).toBe(run?.waiting?.tokenId);
        expect(again?.waiting?.expiresAt).toEqual(run?.waiting?.expiresAt);
        expect(model.doGenerateCalls).toHaveLength(1);
        expect(ctx.notifier.calls).toHaveLength(1);

        // the owner's original token still resumes the run
        await ctx.engine.resume(token, { approved: true });
        await ctx.engine.idle();
        const done = await ctx.store.getRun(runId);
        expect(done).toMatchObject({ status: 'completed', output: 'done' });
        expect(done?.waiting).toBeUndefined();
        expect(ctx.executed).toEqual([{ env: 'prod' }]);
    });

    it('tick does not answer a newer approval from a stale listing', async () => {
        const model = mockModel([deployTurn(), text('done')]);
        const ctx = setup({ model });
        const { runId, run } = await dispatchToWaiting(ctx);
        ctx.engine.stop();
        const before = await ctx.store.latestCheckpoint(runId);
        // a snapshot from before the run moved on to another (unexpired) approval
        const stale = {
            ...run!,
            waiting: {
                ...run!.waiting!,
                tokenId: 'older-token',
                expiresAt: new Date(0),
            },
        };

        // stale listing: the re-read sees the current wait point and skips it
        vi.spyOn(ctx.store, 'listRuns').mockResolvedValueOnce({ data: [stale], total: 1 });
        await ctx.engine.tick();
        // stale listing and re-read: the transition sees another wait point and backs out
        vi.spyOn(ctx.store, 'listRuns').mockResolvedValueOnce({ data: [stale], total: 1 });
        vi.spyOn(ctx.store, 'getRun').mockResolvedValueOnce(stale);
        await ctx.engine.tick();

        const current = await ctx.store.getRun(runId);
        expect(current?.status).toBe('waiting');
        expect(current?.claim).toBeUndefined();
        expect(current?.waiting).toEqual(run?.waiting);
        expect(await ctx.store.latestCheckpoint(runId)).toEqual(before);
        expect(ctx.errors).toEqual([]);

        await ctx.engine.resume(tokenOf(ctx), { approved: true });
        await ctx.engine.start();
        await ctx.engine.idle();
        expect((await ctx.store.getRun(runId))?.status).toBe('completed');
    });

    it('an approval granted on the last allowed step still executes the tool', async () => {
        const model = mockModel([deployTurn(), text('done')]);
        const ctx = setup({ model, budget: { maxSteps: 1 } });
        const { runId } = await dispatchToWaiting(ctx);

        await ctx.engine.resume(tokenOf(ctx), { approved: true });
        await ctx.engine.idle();
        expect(ctx.executed).toEqual([{ env: 'prod' }]);
        expect(await ctx.store.getRun(runId)).toMatchObject({ status: 'completed', output: 'done' });
    });

    it('a resumed approval grants exactly one extra step', async () => {
        const model = mockModel([deployTurn(), deployTurn('dev'), text('never reached')]);
        const ctx = setup({
            model,
            budget: { maxSteps: 1 },
            approvals: { deploy: (input) => ((input as { env: string }).env === 'dev' ? 'allow' : 'user') },
        });
        const { runId } = await dispatchToWaiting(ctx);

        await ctx.engine.resume(tokenOf(ctx), { approved: true });
        await ctx.engine.idle();
        const done = await ctx.store.getRun(runId);
        expect(done?.status).toBe('failed');
        expect(done?.error).toEqual({ code: 'BudgetExceeded', message: 'The run reached its 1 step limit.' });
        expect(model.doGenerateCalls).toHaveLength(2);
        expect(ctx.executed).toEqual([{ env: 'prod' }, { env: 'dev' }]);
    });

    it('an approval denied on the last allowed step still gets a wrap-up model call', async () => {
        const model = mockModel([deployTurn(), text('ok, skipped')]);
        const ctx = setup({ model, budget: { maxSteps: 1 } });
        const { runId } = await dispatchToWaiting(ctx);

        await ctx.engine.resume(tokenOf(ctx), { approved: false, reason: 'no' });
        await ctx.engine.idle();
        expect(ctx.executed).toEqual([]);
        expect(await ctx.store.getRun(runId)).toMatchObject({ status: 'completed', output: 'ok, skipped' });
    });

    it('a FatalToolError from an approved tool marks the run failed', async () => {
        const model = mockModel([deployTurn(), text('kept going')]);
        const ctx = setup({
            model,
            deploy: async () => {
                throw new FatalToolError('repository gone', 'RepoGone');
            },
        });
        const { runId } = await dispatchToWaiting(ctx);

        await ctx.engine.resume(tokenOf(ctx), { approved: true });
        await ctx.engine.idle();
        const done = await ctx.store.getRun(runId);
        expect(done?.status).toBe('failed');
        expect(done?.error).toEqual({ code: 'RepoGone', message: 'repository gone' });
        expect(done?.waiting).toBeUndefined();
        // no model call after the fatal tool
        expect(model.doGenerateCalls).toHaveLength(1);
        const steps = await ctx.store.listSteps(runId);
        expect(steps.map((s) => s.kind)).toEqual(['llm', 'wait', 'tool']);
        expect(steps[2]).toMatchObject({ name: 'deploy', error: { code: 'RepoGone', message: 'repository gone' } });
        expect(steps[2]?.output).toBeUndefined();
    });

    it('a plain error from an approved tool goes back to the model', async () => {
        const model = mockModel([deployTurn(), text('deploy failed, reported')]);
        const ctx = setup({
            model,
            deploy: async () => {
                throw new Error('flaky');
            },
        });
        const { runId } = await dispatchToWaiting(ctx);

        await ctx.engine.resume(tokenOf(ctx), { approved: true });
        await ctx.engine.idle();
        expect(await ctx.store.getRun(runId)).toMatchObject({ status: 'completed', output: 'deploy failed, reported' });
        expect(promptOf(model, 1)).toContain('flaky');
        const steps = await ctx.store.listSteps(runId);
        expect(steps[2]).toMatchObject({ kind: 'tool', error: { code: 'Error', message: 'flaky' } });
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

    it('a failing notifier is reported, the run still waits and the next poll notifies again', async () => {
        const ctx = setup({ model: mockModel([deployTurn(), text('done')]) });
        ctx.notifier.fail = true;
        const { runId, run } = await dispatchToWaiting(ctx);
        expect(run?.status).toBe('waiting');
        expect(run?.waiting?.notifiedAt).toBeUndefined();
        expect(ctx.notifier.calls).toHaveLength(1);
        expect(ctx.errors).toHaveLength(1);
        expect(String(ctx.errors[0])).toContain('notifier down');

        // the failed send did not use up the approval's notification: tick() retries it
        ctx.notifier.fail = false;
        await poll(ctx);
        expect(ctx.notifier.calls).toHaveLength(2);
        expect(ctx.notifier.calls[1]!.opts).toEqual(ctx.notifier.calls[0]!.opts);
        expect(ctx.notifier.calls[1]!.n.resumeToken).toBe(tokenOf(ctx));
        expect((await ctx.store.getRun(runId))?.waiting?.notifiedAt).toBeInstanceOf(Date);

        // delivered: neither later polls nor a re-pause send it again
        await poll(ctx);
        await ctx.store.updateRun(runId, { status: 'queued' }, { expectStatus: ['waiting'] });
        await poll(ctx);
        expect((await ctx.store.getRun(runId))?.status).toBe('waiting');
        expect(ctx.notifier.calls).toHaveLength(2);
        expect(ctx.errors).toHaveLength(1);

        await ctx.engine.resume(tokenOf(ctx, 1), { approved: true });
        await ctx.engine.idle();
        expect((await ctx.store.getRun(runId))?.status).toBe('completed');
    });

    it('a send cut off by a crash is retried once its attempt lock expires', async () => {
        const ctx = setup({ model: mockModel([deployTurn(), text('done')]) });
        ctx.notifier.fail = true;
        // the crashed process never released its attempt lock
        vi.spyOn(ctx.store, 'release').mockResolvedValueOnce(undefined);
        const { runId } = await dispatchToWaiting(ctx);
        expect(ctx.notifier.calls).toHaveLength(1);
        ctx.notifier.fail = false;

        // the lock lives for one attempt (claimTtlMs = 30), not for the idempotency TTL
        await poll(ctx, 10);
        expect(ctx.notifier.calls).toHaveLength(1);
        await poll(ctx, 30);
        expect(ctx.notifier.calls).toHaveLength(2);
        expect((await ctx.store.getRun(runId))?.waiting?.notifiedAt).toBeInstanceOf(Date);

        await ctx.engine.resume(tokenOf(ctx, 1), { approved: true });
        await ctx.engine.idle();
        expect((await ctx.store.getRun(runId))?.status).toBe('completed');
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

    it('a cancel racing the pause settles the run cancelled without notifying', async () => {
        const ctx = setup({ model: mockModel([deployTurn()]) });
        const { promise: gate, resolve: open } = Promise.withResolvers<void>();
        let holding = false;
        const update = ctx.store.updateRun.bind(ctx.store);
        vi.spyOn(ctx.store, 'updateRun').mockImplementation(async (id, patch, opts) => {
            if (patch.status === 'waiting') {
                holding = true;
                await gate;
            }
            return update(id, patch, opts);
        });
        await ctx.engine.start();
        const { runId } = await ctx.engine.dispatch(env());
        await vi.waitFor(() => expect(holding).toBe(true));

        // the abort cannot interrupt the waiting write already in flight
        const cancelled = ctx.engine.cancel(runId);
        open();
        await cancelled;
        await ctx.engine.idle();

        expect(await ctx.store.getRun(runId)).toMatchObject({ status: 'cancelled', waiting: undefined });
        expect(ctx.notifier.calls).toHaveLength(0);
        expect(ctx.errors).toEqual([]);
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
