/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { tool } from 'ai';
import type { LanguageModel } from 'ai';
import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';
import { z } from 'zod';
import type { ChamviError } from '@chamvi/core';
import {
    Engine,
    MemoryStore,
    createResumeToken,
    defineAgent,
    http,
} from '@chamvi/core';
import { openclaw } from '@chamvi/notify-openclaw';
import type { OpenclawNotifierOptions } from '@chamvi/notify-openclaw';
import { ControllableClock } from '@chamvi/test-kit';
import { approvalModel } from '../../utils/model.ts';
import { createFakeOpenclaw } from '../../utils/openclaw.ts';

const TOKEN = 'hooks-token-0123456789';

const engines: Engine[] = [];

afterEach(async () => {
    await Promise.all(engines.map((engine) => engine.stop()));
    engines.length = 0;
});

function setup(
    model: LanguageModel = approvalModel('deploy', { env: 'prod' }),
    patch: Partial<OpenclawNotifierOptions> = {},
) {
    const clock = new ControllableClock(new Date('2026-10-21T09:00:00Z'));
    const fake = createFakeOpenclaw({ token: TOKEN, clock });
    const executed: unknown[] = [];
    const deploy = tool({
        inputSchema: z.object({ env: z.string() }),
        execute: async (input) => {
            executed.push(input);
            return `deployed ${input.env}`;
        },
    });
    const agent = defineAgent({
        name: 'deployer',
        model,
        instructions: 'Deploy.',
        triggers: [http()],
        tools: { deploy },
        approvals: { deploy: 'user' },
        notify: 'openclaw',
    });
    const errors: unknown[] = [];
    const engine = new Engine({
        store: new MemoryStore({ clock }),
        agents: [agent],
        notifiers: {
            openclaw: openclaw({
                baseUrl: 'http://openclaw:18789',
                hooksToken: TOKEN,
                deliver: { channel: 'telegram', to: '12345' },
                clock,
                fetch: fake.fetch,
                ...patch,
            }),
        },
        resumeSecret: 'resume-secret',
        clock,
        claimTtlMs: 30,
        onError: (error) => {
            errors.push(error);
        },
    });
    engines.push(engine);
    return {
        clock,
        fake,
        engine,
        errors,
        executed,
    };
}

type Ctx = ReturnType<typeof setup>;

async function dispatchToWaiting(ctx: Ctx) {
    await ctx.engine.start();
    const { runId } = await ctx.engine.dispatch({
        agent: 'deployer',
        trigger: 'http',
        source: 'http',
        payload: {},
    });
    await ctx.engine.idle();
    const run = await ctx.engine.getRun(runId);
    expect(run?.status).toBe('waiting');
    return runId;
}

describe('openclaw with the engine', () => {
    it('sends one hook per approval', async () => {
        const ctx = setup();
        const runId = await dispatchToWaiting(ctx);
        expect(ctx.fake.requests).toHaveLength(1);
        expect(ctx.fake.dispatched).toHaveLength(1);
        expect((await ctx.engine.getRun(runId))?.waiting?.notifiedAt).toBeInstanceOf(Date);

        await ctx.engine.tick();
        await ctx.engine.tick();
        expect(ctx.fake.requests).toHaveLength(1);
        expect(ctx.errors).toEqual([]);
    });

    it('retries a failed hook with the same key', async () => {
        const ctx = setup();
        ctx.fake.failNext(503);
        const runId = await dispatchToWaiting(ctx);
        expect(ctx.errors).toHaveLength(1);
        expect((ctx.errors[0] as ChamviError).code).toBe('openclaw_request');
        expect((await ctx.engine.getRun(runId))?.waiting?.notifiedAt).toBeUndefined();

        await ctx.engine.tick();
        expect(ctx.fake.requests).toHaveLength(2);
        const [first, second] = ctx.fake.requests;
        expect(second!.headers['idempotency-key']).toBe(first!.headers['idempotency-key']);
        expect(JSON.stringify(second!.body)).toBe(JSON.stringify(first!.body));
        expect(ctx.fake.dispatched).toHaveLength(1);
        expect((await ctx.engine.getRun(runId))?.waiting?.notifiedAt).toBeInstanceOf(Date);
    });

    it('replays a lost response', async () => {
        const ctx = setup();
        ctx.fake.loseNextResponse();
        const runId = await dispatchToWaiting(ctx);
        expect(ctx.errors).toHaveLength(1);
        // OpenClaw admitted the first send, the engine never learned it
        expect(ctx.fake.dispatched).toHaveLength(1);

        await ctx.engine.tick();
        expect(ctx.fake.requests).toHaveLength(2);
        // one admitted OpenClaw run per approval across engine retries
        expect(ctx.fake.dispatched).toHaveLength(1);
        expect((await ctx.engine.getRun(runId))?.waiting?.notifiedAt).toBeInstanceOf(Date);
    });

    it('links to the approval without the token', async () => {
        const ctx = setup(undefined, { approvalUrl: (ref) => `https://chamvi.example/ui/approvals?run=${ref.runId}&approval=${ref.approvalId}&agent=${ref.agent}` });
        const runId = await dispatchToWaiting(ctx);
        const waiting = (await ctx.engine.getRun(runId))!.waiting!;
        const [request] = ctx.fake.requests;
        expect((request!.body as { message: string }).message).toContain(`Approve or deny: https://chamvi.example/ui/approvals?run=${runId}&approval=${waiting.approvalId}&agent=deployer`);
        const token = createResumeToken('resume-secret', {
            runId,
            approvalId: waiting.approvalId,
            tokenId: waiting.tokenId,
            expiresAt: waiting.expiresAt,
        });
        const sent = JSON.stringify({
            url: request!.url,
            headers: request!.headers,
            body: request!.body,
        });
        expect(sent).not.toContain(token);
        expect(sent).not.toContain(token.split('.')[1]);
        expect(sent).not.toContain('resume_run');
    });

    it('answers through the token in the message with resumeTool', async () => {
        const ctx = setup(undefined, { resumeTool: true });
        const runId = await dispatchToWaiting(ctx);
        const token = /"token":"([^"]+)"/.exec(ctx.fake.dispatched[0]!.message)?.[1];
        expect(token).toBeTypeOf('string');
        await ctx.engine.resume(token!, { approved: true });
        await ctx.engine.idle();
        expect((await ctx.engine.getRun(runId))?.status).toBe('completed');
        expect(ctx.executed).toEqual([{ env: 'prod' }]);
    });
});
