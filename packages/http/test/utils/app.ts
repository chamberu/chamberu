/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { tool } from 'ai';
import { z } from 'zod';
import {
    MemoryStore,
    RunEngine,
    cron,
    defineAgent,
    http,
    webhook,
} from '@chamberu/core';
import type { Agent, INotifier, Notification } from '@chamberu/core';
import { ControllableClock } from '@chamberu/test-kit';
import { createHttpApp, staticTokens } from '@chamberu/http';
import type { HttpAppOptions, Principal } from '@chamberu/http';
import type { App } from 'routup';
import { approvalModel, textModel } from './model.ts';

export const ADMIN_TOKEN = 'admin-token-0123456789';
export const READER_TOKEN = 'reader-token-0123456789';

/** Admin and reader principals by bearer token. */
export const testAuth = staticTokens({
    tokens: {
        [ADMIN_TOKEN]: { id: 'admin', permissions: ['*'] },
        [READER_TOKEN]: { id: 'reader', permissions: ['run:read'] },
    },
});

export type TestAppOverrides = Partial<Omit<HttpAppOptions, 'clock'>> & {
    agents?: Agent[];
    clock?: ControllableClock;
    notifiers?: Record<string, INotifier>;
};

export function createTestApp(overrides: TestAppOverrides = {}) {
    const clock = overrides.clock ?? new ControllableClock(new Date(1_000_000));
    const store = overrides.store ?? new MemoryStore({ clock });
    const agents = overrides.agents ?? [
        defineAgent({
            name: 'echo',
            model: textModel(),
            instructions: 'Echo.',
            triggers: [http()],
        }),
    ];
    const engine = overrides.engine ?? new RunEngine({
        store,
        agents,
        resumeSecret: 'test-secret',
        clock,
        notifiers: overrides.notifiers,
        onError: () => {},
    });
    const app = createHttpApp({
        auth: [testAuth, permissionsAuth],
        metrics: false,
        rateLimit: false,
        ...overrides,
        engine,
        store,
        agents,
        clock,
    });
    return {
        app,
        engine,
        store,
        clock,
        agents,
    };
}

export type CallOptions = {
    token?: string;
    body?: unknown;
    headers?: Record<string, string>;
    signal?: AbortSignal;
};

export function call(app: App, method: string, path: string, options: CallOptions = {}): Promise<Response> {
    const headers = new Headers({ accept: 'application/json', ...options.headers });
    if (options.token) headers.set('authorization', `Bearer ${options.token}`);
    let body: string | undefined;
    if (options.body !== undefined) {
        body = JSON.stringify(options.body);
        if (!headers.has('content-type')) headers.set('content-type', 'application/json');
    }
    return app.fetch(new Request(`http://test${path}`, {
        method,
        headers,
        body,
        signal: options.signal,
    }));
}

/** Records every notification it is asked to send. */
export class CapturingNotifier implements INotifier {
    readonly name = 'capture';

    readonly sent: Notification[] = [];

    async notify(n: Notification): Promise<void> {
        this.sent.push(n);
    }

    /** The resume token of the latest approval notification. */
    get lastToken(): string {
        const token = this.sent.findLast((n) => n.kind === 'approval')?.resumeToken;
        if (!token) throw new Error('no approval notification captured');
        return token;
    }
}

/**
 * `echo` (http, text), `gate` (http, approval on `deploy`, notifies
 * `capture`), `sweep` (cron only) and `hooked` (webhook only); fresh models
 * per call.
 */
export function createRunAgents(): Agent[] {
    return [
        defineAgent({
            name: 'echo',
            model: textModel(),
            instructions: 'Echo.',
            triggers: [http()],
        }),
        defineAgent({
            name: 'gate',
            model: approvalModel('deploy'),
            instructions: 'Deploy.',
            triggers: [http()],
            tools: () => ({ deploy: tool({ inputSchema: z.object({}), execute: async () => 'deployed' }) }),
            approvals: { deploy: 'user' },
            notify: 'capture',
        }),
        defineAgent({
            name: 'sweep',
            model: textModel(),
            instructions: 'Sweep.',
            triggers: [cron('0 * * * *')],
        }),
        defineAgent({
            name: 'hooked',
            model: textModel(),
            instructions: 'Hooked.',
            triggers: [webhook({ path: '/x' })],
        }),
    ];
}

/** `createTestApp` over `createRunAgents()` with a capturing notifier. */
export function createRunTestApp(overrides: TestAppOverrides = {}) {
    const notifier = new CapturingNotifier();
    const setup = createTestApp({
        agents: createRunAgents(),
        notifiers: { capture: notifier },
        ...overrides,
    });
    return { ...setup, notifier };
}

/** An authenticator that maps `Bearer p:<a>,<b>` to a principal with those permissions. */
export async function permissionsAuth(request: Request): Promise<Principal | undefined> {
    const match = /^Bearer p:(.*)$/.exec(request.headers.get('authorization') ?? '');
    if (!match) return undefined;
    const permissions = match[1] ? match[1].split(',') : [];
    return {
        id: `p:${match[1]}`, 
        kind: 'token', 
        permissions, 
    };
}

/** The bearer token `permissionsAuth` reads as exactly these permissions. */
export function tokenFor(...permissions: string[]): string {
    return `p:${permissions.join(',')}`;
}

/** Waits until every pending microtask and immediate ran. */
export function flush(): Promise<void> {
    return new Promise((resolve) => { setImmediate(resolve); });
}
