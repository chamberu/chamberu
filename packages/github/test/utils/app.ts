/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createHmac } from 'node:crypto';
import { MemoryStore, RunEngine } from '@chamberu/core';
import type { Agent, INotifier } from '@chamberu/core';
import { createGithubApp } from '@chamberu/github';
import type { GithubAppOptions, GithubWebhookRouteOptions, IGithubApp } from '@chamberu/github';
import { createHttpApp, staticTokens } from '@chamberu/http';
import type { HttpAppOptions } from '@chamberu/http';
import { ControllableClock } from '@chamberu/test-kit';
import { createFakeGithub } from './github.ts';
import type { FakeGithub } from './github.ts';

/** The http app (a routup `App`). */
export type App = ReturnType<typeof createHttpApp>;

export const WEBHOOK_SECRET = 'webhook-secret';

export const START = new Date('2026-10-20T10:00:00Z');

export type GithubTestAppInput = {
    /** Agents the engine (and so the webhook route) knows; a function of the GitHub app for agents whose tools come from it. */
    agents: Agent[] | ((gh: IGithubApp) => Agent[]);
    rateLimit?: HttpAppOptions['rateLimit'];
    bodyLimit?: number;
    route?: GithubWebhookRouteOptions;
    github?: Partial<GithubAppOptions>;
    notifiers?: Record<string, INotifier>;
    /** Receives every error the engine and the http app report. */
    onError?: (error: unknown) => void;
};

export type GithubTestApp = {
    app: App;
    engine: RunEngine;
    store: MemoryStore;
    clock: ControllableClock;
    fake: FakeGithub;
    gh: IGithubApp;
    errors: unknown[];
};

/** A clock, a fake GitHub and a GitHub app over it. */
export function createGithubFixture(github: Partial<GithubAppOptions> = {}) {
    const clock = new ControllableClock(START);
    const fake = createFakeGithub({ appId: '123', clock });
    const gh = createGithubApp({
        appId: 123,
        privateKey: fake.privateKey,
        webhookSecret: WEBHOOK_SECRET,
        clock,
        fetch: fake.fetch,
        ...github,
    });
    return {
        clock,
        fake,
        gh,
    };
}

/**
 * Engine, http app with `gh.webhookRoute()` (metrics off, limiter off unless
 * given) and a fake GitHub.
 */
export function createGithubTestApp(input: GithubTestAppInput): GithubTestApp {
    const {
        clock, 
        fake, 
        gh, 
    } = createGithubFixture(input.github);
    const agents = typeof input.agents === 'function' ? input.agents(gh) : input.agents;
    const errors: unknown[] = [];
    const onError = (error: unknown) => {
        errors.push(error);
        input.onError?.(error);
    };
    const store = new MemoryStore({ clock });
    const engine = new RunEngine({
        store,
        agents,
        resumeSecret: 'test-secret',
        clock,
        notifiers: input.notifiers,
        onError,
    });
    const app = createHttpApp({
        engine,
        auth: [staticTokens({ tokens: { 'admin-token-0123456789': { id: 'admin', permissions: ['*'] } } })],
        metrics: false,
        rateLimit: input.rateLimit ?? false,
        ...(input.bodyLimit !== undefined ? { bodyLimit: input.bodyLimit } : {}),
        routes: [gh.webhookRoute(input.route)],
        onError,
    });
    return {
        app,
        engine,
        store,
        clock,
        fake,
        gh,
        errors,
    };
}

/** `sha256=<hex>` of the HMAC-SHA256 of `body` under `secret`. */
export function sign(body: string | Uint8Array, secret = WEBHOOK_SECRET): string {
    return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

export type DeliverInput = {
    event?: string;
    delivery?: string;
    /** Sent as these exact bytes. */
    body: string;
    /** Default WEBHOOK_SECRET; `null` sends no signature header. */
    secret?: string | null;
    /** Overrides the computed signature header. */
    signature?: string;
    contentType?: string;
    path?: string;
};

/** POSTs a signed delivery to the app. */
export function deliver(app: App, input: DeliverInput): Promise<Response> {
    const headers = new Headers({ 'content-type': input.contentType ?? 'application/json' });
    if (input.event !== undefined) headers.set('x-github-event', input.event);
    if (input.delivery !== undefined) headers.set('x-github-delivery', input.delivery);
    if (input.signature !== undefined) {
        headers.set('x-hub-signature-256', input.signature);
    } else if (input.secret !== null) {
        headers.set('x-hub-signature-256', sign(input.body, input.secret ?? WEBHOOK_SECRET));
    }
    return app.fetch(new Request(`http://test${input.path ?? '/webhooks/github'}`, {
        method: 'POST',
        headers,
        body: input.body,
    }));
}
