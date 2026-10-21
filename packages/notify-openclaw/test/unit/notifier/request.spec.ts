/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import { ChamviError } from '@chamvi/core';
import type { Notification, NotifyOptions, TriggerEnvelope } from '@chamvi/core';
import { MESSAGE_BODY_MAX_LENGTH, OPENCLAW_TIMEOUT_MS, openclaw } from '@chamvi/notify-openclaw';
import type { OpenclawNotifierOptions } from '@chamvi/notify-openclaw';
import { ControllableClock } from '@chamvi/test-kit';
import { createFakeOpenclaw } from '../../utils/openclaw.ts';

const TOKEN = 'hooks-token-0123456789';

const trigger: TriggerEnvelope = {
    id: 'e1',
    agent: 'release',
    trigger: 'http',
    source: 'http',
    payload: {},
    receivedAt: new Date('2026-10-21T09:00:00Z'),
};

const approval: Notification = {
    kind: 'approval',
    agent: 'release',
    runId: 'r1',
    title: 'Approval required: deploy',
    body: 'Agent "release" wants to call "deploy" with:\n{\n  "env": "prod"\n}',
    resumeToken: 'tok',
    expiresAt: new Date('2026-10-21T10:00:00Z'),
};

const opts: NotifyOptions = { idempotencyKey: 'r1:a1', trigger };

function setup(patch: Partial<OpenclawNotifierOptions> = {}) {
    const clock = new ControllableClock(new Date('2026-10-21T09:00:00Z'));
    const fake = createFakeOpenclaw({ token: TOKEN, clock });
    const notifier = openclaw({
        baseUrl: 'http://openclaw:18789',
        hooksToken: TOKEN,
        agentId: 'main',
        deliver: { channel: 'telegram', to: '12345' },
        clock,
        fetch: fake.fetch,
        ...patch,
    });
    return {
        clock, 
        fake, 
        notifier, 
    };
}

const messageOf = (body: unknown) => (body as { message: string }).message;

async function rejection(promise: Promise<unknown>): Promise<ChamviError> {
    const error = await promise.then(() => undefined, (e: unknown) => e);
    expect(error).toBeInstanceOf(ChamviError);
    return error as ChamviError;
}

describe('openclaw notify', () => {
    it('posts the hook', async () => {
        const { fake, notifier } = setup();
        await notifier.notify(approval, opts);
        expect(fake.requests).toHaveLength(1);
        const [request] = fake.requests;
        expect(request!.url).toBe('http://openclaw:18789/hooks/agent');
        expect(request!.method).toBe('POST');
        expect(request!.headers).toMatchObject({
            'authorization': `Bearer ${TOKEN}`,
            'idempotency-key': 'r1:a1',
            'content-type': 'application/json',
        });
        expect(request!.body).toEqual({
            message: expect.any(String),
            name: 'chamvi',
            agentId: 'main',
            deliver: true,
            channel: 'telegram',
            to: '12345',
        });
        expect(fake.dispatched).toHaveLength(1);
    });

    it('sends the accountId and omits a missing agentId', async () => {
        const { fake, notifier } = setup({
            agentId: undefined,
            deliver: {
                channel: 'telegram',
                to: '12345',
                accountId: 'bot-2',
            },
        });
        await notifier.notify(approval, opts);
        const body = fake.requests[0]!.body as Record<string, unknown>;
        expect(body.accountId).toBe('bot-2');
        expect(body).not.toHaveProperty('agentId');
    });

    it('posts under a custom hooks path', async () => {
        const clock = new ControllableClock();
        // a reverse proxy serving the gateway under /base
        const fake = createFakeOpenclaw({ token: TOKEN, hooksPath: '/base/oc-hooks' });
        const notifier = openclaw({
            baseUrl: 'https://gw.example/base/',
            hooksToken: TOKEN,
            hooksPath: '/oc-hooks',
            deliver: { channel: 'telegram', to: '12345' },
            clock,
            fetch: fake.fetch,
        });
        await notifier.notify(approval, opts);
        expect(fake.requests[0]!.url).toBe('https://gw.example/base/oc-hooks/agent');
    });

    it('drops a trailing slash of the hooks path', async () => {
        const fake = createFakeOpenclaw({ token: TOKEN });
        const notifier = openclaw({
            baseUrl: 'http://openclaw:18789',
            hooksToken: TOKEN,
            hooksPath: '/hooks/',
            deliver: { channel: 'telegram', to: '12345' },
            clock: new ControllableClock(),
            fetch: fake.fetch,
        });
        await notifier.notify(approval, opts);
        expect(fake.requests[0]!.url).toBe('http://openclaw:18789/hooks/agent');
    });

    it('renders an approval without the token by default', async () => {
        const { fake, notifier } = setup();
        await notifier.notify(approval, opts);
        expect(messageOf(fake.requests[0]!.body)).toBe([
            'chamvi notification. Relay it to the user; keep every link and id exactly as written.',
            '',
            'Approval required: deploy',
            '',
            approval.body,
            '',
            'Agent: release',
            'Run: r1',
            '',
            'Expires: 2026-10-21T10:00:00.000Z',
            'Answer it in the chamvi UI or through the chamvi MCP server; this message carries no resume token.',
        ].join('\n'));
    });

    it('never sends the token by default', async () => {
        const { fake, notifier } = setup();
        const secret = 'resume-token-c8f1e2d4';
        await notifier.notify({ ...approval, resumeToken: secret }, opts);
        const [request] = fake.requests;
        const sent = JSON.stringify({
            url: request!.url,
            headers: request!.headers,
            body: request!.body,
        });
        expect(sent).not.toContain(secret);
        expect(sent).not.toContain(encodeURIComponent(secret));
        expect(sent).not.toContain('resume_run');
    });

    it('asks to keep a token only when the message carries the resume_run call', async () => {
        const { fake, notifier } = setup();
        await notifier.notify(approval, opts);
        await notifier.notify({
            kind: 'result',
            agent: 'release',
            runId: 'r1',
            title: 'Done',
            body: 'Deployed.',
        }, opts);
        const linked = setup({ resumeUrl: (token) => `https://app.example/ui/approvals?token=${token}` });
        await linked.notifier.notify(approval, opts);
        for (const request of [...fake.requests, ...linked.fake.requests]) {
            const [relay] = messageOf(request.body).split('\n');
            expect(relay).toBe('chamvi notification. Relay it to the user; keep every link and id exactly as written.');
        }
    });

    it('renders only the resume link when configured', async () => {
        const { fake, notifier } = setup({ resumeUrl: (token) => `https://app.example/ui/approvals?token=${token}` });
        await notifier.notify(approval, opts);
        const message = messageOf(fake.requests[0]!.body);
        expect(message.endsWith('Expires: 2026-10-21T10:00:00.000Z\nApprove or deny: https://app.example/ui/approvals?token=tok')).toBe(true);
        expect(message).not.toContain('"token"');
        expect(message).not.toContain('resume_run');
        expect(message).not.toContain('carries no resume token');
    });

    it('renders the token and the resume_run call with resumeTool', async () => {
        const { fake, notifier } = setup({ resumeTool: true });
        await notifier.notify(approval, opts);
        expect(messageOf(fake.requests[0]!.body)).toBe([
            'chamvi notification. Relay it to the user; keep every link, id and token exactly as written.',
            '',
            'Approval required: deploy',
            '',
            approval.body,
            '',
            'Agent: release',
            'Run: r1',
            '',
            'Expires: 2026-10-21T10:00:00.000Z',
            'Or call the chamvi MCP tool resume_run with {"token":"tok","approved":true} to approve, or "approved":false to deny.',
        ].join('\n'));
    });

    it('renders the link and the resume_run call with resumeTool and resumeUrl', async () => {
        const { fake, notifier } = setup({
            resumeTool: true,
            resumeUrl: (token) => `https://app.example/ui/approvals?token=${token}`,
        });
        await notifier.notify(approval, opts);
        const message = messageOf(fake.requests[0]!.body);
        expect(message).toContain('Approve or deny: https://app.example/ui/approvals?token=tok\nOr call the chamvi MCP tool resume_run with {"token":"tok","approved":true}');
    });

    it('renders other kinds without approval lines', async () => {
        const { fake, notifier } = setup();
        await notifier.notify({
            kind: 'result',
            agent: 'release',
            runId: 'r1',
            title: 'Done',
            body: 'Deployed.',
        }, opts);
        const message = messageOf(fake.requests[0]!.body);
        expect(message.endsWith('Agent: release\nRun: r1')).toBe(true);
        expect(message).not.toContain('resume_run');
    });

    it('is deterministic', async () => {
        const {
            fake, 
            notifier, 
            clock, 
        } = setup({ resumeUrl: (token) => `https://app.example/ui/approvals?token=${token}` });
        await notifier.notify(approval, opts);
        clock.advance(60_000);
        await notifier.notify(approval, opts);
        expect(JSON.stringify(fake.requests[1]!.body)).toBe(JSON.stringify(fake.requests[0]!.body));
        expect(fake.requests[1]!.headers['idempotency-key']).toBe(fake.requests[0]!.headers['idempotency-key']);
        // OpenClaw replays the second request instead of starting another run
        expect(fake.dispatched).toHaveLength(1);
    });

    it('cuts a huge body', async () => {
        const { fake, notifier } = setup();
        await notifier.notify({ ...approval, body: 'x'.repeat(1024 * 1024) }, opts);
        const message = messageOf(fake.requests[0]!.body);
        expect(message.length).toBeLessThan(MESSAGE_BODY_MAX_LENGTH + 500);
        expect(message).toContain('more characters)\n\nAgent: release');
        expect(message).toContain(`(cut, ${1024 * 1024 - MESSAGE_BODY_MAX_LENGTH} more characters)`);
    });

    it('never splits a surrogate pair', async () => {
        const { fake, notifier } = setup();
        // the cut point falls between the two halves of an emoji
        const body = `${'x'.repeat(MESSAGE_BODY_MAX_LENGTH - 1)}😀${'y'.repeat(100)}`;
        await notifier.notify({ ...approval, body }, opts);
        const message = messageOf(fake.requests[0]!.body);
        expect(message).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
        expect(message).not.toMatch(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
    });

    it('hashes a long key', async () => {
        const { fake, notifier } = setup();
        const long = 'k'.repeat(300);
        await notifier.notify(approval, { ...opts, idempotencyKey: long });
        await notifier.notify(approval, { ...opts, idempotencyKey: long });
        const sent = fake.requests.map((r) => r.headers['idempotency-key']);
        expect(sent[0]).toMatch(/^sha256:[0-9a-f]{64}$/);
        expect(sent[1]).toBe(sent[0]);
        expect(fake.dispatched).toHaveLength(1);

        const exact = 'k'.repeat(256);
        await notifier.notify(approval, { ...opts, idempotencyKey: exact });
        expect(fake.requests[2]!.headers['idempotency-key']).toBe(exact);
    });

    it('hashes a key with whitespace', async () => {
        const { fake, notifier } = setup();
        await notifier.notify(approval, { ...opts, idempotencyKey: ' r1 a1 ' });
        expect(fake.requests[0]!.headers['idempotency-key']).toMatch(/^sha256:[0-9a-f]{64}$/);
    });

    it.each([
        [400, {}, '{"error":"bad channel"}'],
        [401, {}, undefined],
        [404, {}, undefined],
        [409, {}, undefined],
        [413, {}, undefined],
        [429, { 'retry-after': '30' }, undefined],
        [503, {}, undefined],
    ])('throws on a refused hook (%i)', async (status, headers, body) => {
        const { fake, notifier } = setup();
        fake.failNext(status, headers, body);
        const error = await rejection(notifier.notify(approval, opts));
        expect(error.code).toBe('openclaw_request');
        expect(error.message.startsWith(`OpenClaw ${status}:`)).toBe(true);
        expect(error.message).toContain(body ?? '{"error":"injected"}');
        if (status === 429) expect(error.message).toContain('retry after 30');
        expect(error.message).not.toContain(TOKEN);
        expect(fake.dispatched).toHaveLength(0);
    });

    it('cuts the response text', async () => {
        const { fake, notifier } = setup();
        fake.failNext(400, {}, 'e'.repeat(10_000));
        const error = await rejection(notifier.notify(approval, opts));
        expect(error.message.length).toBeLessThan(700);
    });

    it('redacts an echoed token', async () => {
        const { fake, notifier } = setup();
        fake.failNext(400, {}, `{"error":"rejected: $MESSAGE","auth":"${TOKEN}"}`);
        const error = await rejection(notifier.notify({ ...approval, resumeToken: 'tok-secret' }, opts));
        expect(error.message).toContain('[redacted]');
        expect(error.message).not.toContain('tok-secret');
        expect(error.message).not.toContain(TOKEN);
    });

    it('throws on a network failure', async () => {
        const { fake, notifier } = setup();
        fake.loseNextResponse();
        const error = await rejection(notifier.notify(approval, opts));
        expect(error.code).toBe('openclaw_request');
        expect(error.message).toBe('OpenClaw request failed: fetch failed (other side closed)');
    });

    it('redacts the tokens in a fetch failure and its cause', async () => {
        const { notifier } = setup({
            fetch: async () => {
                throw new TypeError(`Headers.append: "Bearer ${TOKEN}" is an invalid header value.`, { cause: new Error('tok-secret seen') });
            },
        });
        const error = await rejection(notifier.notify({ ...approval, resumeToken: 'tok-secret' }, opts));
        expect(error.code).toBe('openclaw_request');
        expect(error.message).toBe('OpenClaw request failed: Headers.append: "Bearer [redacted]" is an invalid header value. ([redacted] seen)');
    });

    it('times out', async () => {
        const {
            fake, 
            notifier, 
            clock, 
        } = setup();
        fake.hangNext();
        const pending = notifier.notify(approval, opts);
        await vi.waitFor(() => expect(fake.requests).toHaveLength(1));
        clock.advance(OPENCLAW_TIMEOUT_MS);
        const error = await rejection(pending);
        expect(error.code).toBe('openclaw_request');
        expect(error.message).toBe('OpenClaw did not answer within 30000ms.');
    });

    it('clears its timer after a send', async () => {
        const clock = new ControllableClock(new Date('2026-10-21T09:00:00Z'));
        const fake = createFakeOpenclaw({ token: TOKEN, clock });
        const signals: AbortSignal[] = [];
        const notifier = openclaw({
            baseUrl: 'http://openclaw:18789',
            hooksToken: TOKEN,
            deliver: { channel: 'telegram', to: '12345' },
            timeoutMs: 1000,
            clock,
            fetch: (resource, init) => {
                if (init?.signal) signals.push(init.signal);
                return fake.fetch(resource, init);
            },
        });
        await notifier.notify(approval, opts);
        clock.advance(1000);
        expect(signals).toHaveLength(1);
        expect(signals[0]!.aborted).toBe(false);
    });

    it('resolves on any 2xx', async () => {
        const { notifier, clock } = setup();
        await expect(notifier.notify(approval, opts)).resolves.toBeUndefined();
        const accepted = openclaw({
            baseUrl: 'http://openclaw:18789',
            hooksToken: TOKEN,
            deliver: { channel: 'telegram', to: '12345' },
            clock,
            fetch: async () => new Response(null, { status: 202 }),
        });
        await expect(accepted.notify(approval, opts)).resolves.toBeUndefined();
    });
});
