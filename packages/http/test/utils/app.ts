/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    MemoryStore,
    RunEngine,
    defineAgent,
    http,
} from '@chamberu/core';
import type { Agent, INotifier } from '@chamberu/core';
import { ControllableClock } from '@chamberu/test-kit';
import { createHttpApp, staticTokens } from '@chamberu/http';
import type { HttpAppOptions } from '@chamberu/http';
import type { App } from 'routup';
import { textModel } from './model.ts';

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
        auth: testAuth,
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
