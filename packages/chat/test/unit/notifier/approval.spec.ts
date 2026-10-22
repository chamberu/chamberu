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
import { createResumeToken, defineEffectTool } from '@chamvi/core';
import { APPROVE_ACTION_ID, DENY_ACTION_ID } from '@chamvi/chat';
import type { ChatBridgeOptions } from '@chamvi/chat';
import { jsonSchema } from 'ai';
import type { CardElement } from 'chat';
import { approvalModel } from '../../utils/model.ts';
import { OWNER, mention, setupChat } from '../../utils/setup.ts';
import type { ChatSetup } from '../../utils/setup.ts';

const setups: ChatSetup[] = [];

afterEach(async () => {
    await Promise.all(setups.map((ctx) => ctx.engine.stop()));
    setups.length = 0;
});

const deploy = defineEffectTool({
    description: 'Deploys.',
    inputSchema: jsonSchema<Record<string, never>>({
        type: 'object',
        properties: {},
        additionalProperties: false,
    }),
    execute: async () => ({ deployed: true }),
});

function setup(resolveInvoker?: ChatBridgeOptions['resolveInvoker']) {
    const ctx = setupChat({
        agents: [{
            model: approvalModel('deploy'),
            tools: { deploy },
            approvals: { deploy: 'user' },
            notify: 'chat',
        }],
        bridge: {
            approvalUrl: (ref) => `https://chamvi.example/ui/approvals?run=${ref.runId}&approval=${ref.approvalId}`,
            ...(resolveInvoker ? { resolveInvoker } : {}),
        },
    });
    setups.push(ctx);
    return ctx;
}

async function toWaiting(ctx: ChatSetup) {
    await ctx.engine.start();
    await ctx.deliver(mention('@bot deploy please'));
    await ctx.engine.idle();
    const { data: [run] } = await ctx.engine.store.listRuns({});
    expect(run!.status).toBe('waiting');
    return run!;
}

function cardOf(ctx: ChatSetup): CardElement {
    const post = ctx.adapter.posts.find((p) => (p.message as { card?: CardElement }).card ?? (p.message as CardElement).type === 'card');
    expect(post?.threadId).toBe('slack:C1:T1');
    const message = post!.message as CardElement | { card: CardElement };
    return 'card' in message ? message.card : message;
}

function click(ctx: ChatSetup, actionId: string, value: string, user = 'U-OWNER') {
    return ctx.deliver({
        type: 'action',
        actionId,
        value,
        channel: 'C1',
        thread: 'T1',
        messageId: 'posted-1',
        user,
    });
}

describe('approvals in the thread', () => {
    it('posts one approval card with buttons and a link, never the token', async () => {
        const ctx = setup();
        const run = await toWaiting(ctx);
        await ctx.engine.tick();
        await ctx.engine.tick();

        const cards = ctx.adapter.posts.filter((p) => JSON.stringify(p.message).includes(APPROVE_ACTION_ID));
        expect(cards).toHaveLength(1);
        const card = JSON.stringify(cardOf(ctx));
        expect(card).toContain(DENY_ACTION_ID);
        expect(card).toContain(`https://chamvi.example/ui/approvals?run=${run.id}&approval=${run.waiting!.approvalId}`);
        const token = createResumeToken('resume-secret', {
            runId: run.id,
            approvalId: run.waiting!.approvalId,
            tokenId: run.waiting!.tokenId,
            expiresAt: run.waiting!.expiresAt,
        });
        expect(card).not.toContain(token.split('.')[1]);
        expect((await ctx.engine.getRun(run.id))!.waiting!.notifiedAt).toBeInstanceOf(Date);
    });

    it('resumes the run when an allowed user approves', async () => {
        const ctx = setup((author) => (author.userId === 'U-OWNER' ? OWNER : undefined));
        const run = await toWaiting(ctx);
        const value = JSON.stringify({ runId: run.id, approvalId: run.waiting!.approvalId });

        await click(ctx, APPROVE_ACTION_ID, value);
        const resumed = await ctx.engine.getRun(run.id);
        expect(['queued', 'running', 'completed']).toContain(resumed!.status);
        expect(ctx.adapter.posts.at(-1)!.message).toBe('Approved by Owner.');

        await ctx.engine.idle();
        expect((await ctx.engine.getRun(run.id))!.status).toBe('completed');
        const steps = await ctx.engine.store.listSteps(run.id);
        expect(steps.find((s) => s.kind === 'wait')?.output).toMatchObject({ approved: true, approver: OWNER });
        expect(ctx.errors).toEqual([]);
    });

    it('denies through the deny button', async () => {
        const ctx = setup(() => OWNER);
        const run = await toWaiting(ctx);
        await click(ctx, DENY_ACTION_ID, JSON.stringify({ runId: run.id, approvalId: run.waiting!.approvalId }));
        expect(ctx.adapter.posts.at(-1)!.message).toBe('Denied by Owner.');
        await ctx.engine.idle();
        const steps = await ctx.engine.store.listSteps(run.id);
        expect(steps.find((s) => s.kind === 'wait')?.output).toMatchObject({ approved: false });
    });

    it('refuses users without the approve permission and answers privately', async () => {
        const ctx = setup((author) => (author.userId === 'U-OWNER' ? OWNER : {
            id: author.userId,
            kind: 'slack',
            permissions: ['agent:helper:run'],
        }));
        const run = await toWaiting(ctx);
        const value = JSON.stringify({ runId: run.id, approvalId: run.waiting!.approvalId });

        await click(ctx, APPROVE_ACTION_ID, value, 'U-MALLORY');
        expect((await ctx.engine.getRun(run.id))!.status).toBe('waiting');
        expect(ctx.adapter.ephemerals.at(-1)).toMatchObject({ threadId: 'slack:C1:T1', userId: 'U-MALLORY' });
    });

    it('refuses every click without resolveInvoker', async () => {
        const ctx = setup();
        const run = await toWaiting(ctx);
        await click(ctx, APPROVE_ACTION_ID, JSON.stringify({ runId: run.id, approvalId: run.waiting!.approvalId }));
        expect((await ctx.engine.getRun(run.id))!.status).toBe('waiting');
        expect(ctx.adapter.ephemerals).toHaveLength(1);
    });

    it('tells about an answered approval, an unknown run and ignores foreign values', async () => {
        const ctx = setup(() => OWNER);
        const run = await toWaiting(ctx);
        const value = JSON.stringify({ runId: run.id, approvalId: run.waiting!.approvalId });
        await click(ctx, APPROVE_ACTION_ID, value);
        await click(ctx, APPROVE_ACTION_ID, value);
        await click(ctx, APPROVE_ACTION_ID, JSON.stringify({ runId: 'missing', approvalId: 'a' }));
        await click(ctx, APPROVE_ACTION_ID, 'not json');
        expect(ctx.adapter.ephemerals.map((e) => e.message)).toEqual([
            'This approval was already answered or has expired.',
            'This run no longer exists.',
        ]);
        expect(ctx.errors).toEqual([]);
    });
});
