/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import type { App } from 'routup';
import {
    ADMIN_TOKEN,
    call,
    createRunTestApp,
    createTestApp,
} from '../../utils/app.ts';

type RequestOptions = {
    method?: string;
    ip?: string;
    token?: string;
    headers?: Record<string, string>;
};

/** A request with a socket address (routup reads `request.ip`). */
function send(app: App, path: string, options: RequestOptions = {}): Promise<Response> {
    const headers = new Headers(options.headers);
    if (options.token) headers.set('authorization', `Bearer ${options.token}`);
    const request = new Request(`http://test${path}`, { method: options.method ?? 'GET', headers });
    (request as Request & { ip?: string }).ip = options.ip ?? '10.0.0.1';
    return app.fetch(request);
}

describe('metrics', () => {
    it('serves /metrics by default, one registry per app', async () => {
        const first = createTestApp({ metrics: undefined });
        const second = createTestApp({ metrics: undefined });
        for (const { app } of [first, second]) {
            await send(app, '/healthz');
            const response = await send(app, '/metrics');
            expect(response.status).toBe(200);
            expect(response.headers.get('content-type')).toContain('text/plain');
            expect(await response.text()).toContain('http_request_duration');
        }
    });

    it('is off with metrics: false', async () => {
        const { app } = createTestApp({ metrics: false });
        expect((await send(app, '/metrics')).status).toBe(404);
    });

    it('does not time sse streams', async () => {
        const { app, engine } = createRunTestApp({ metrics: undefined });
        const started = await call(app, 'POST', '/agents/echo/runs', { token: ADMIN_TOKEN });
        const { runId } = await started.json() as { runId: string };
        await engine.start();
        await engine.idle();

        const stream = await send(app, `/runs/${runId}/stream`, { token: ADMIN_TOKEN });
        await stream.text();
        await send(app, '/agents', { token: ADMIN_TOKEN });

        const metrics = await (await send(app, '/metrics')).text();
        const samples = metrics.split('\n').filter((line) => line.startsWith('http_request_duration'));
        expect(samples.some((line) => line.includes('/agents'))).toBe(true);
        expect(samples.some((line) => line.includes('/stream'))).toBe(false);
        await engine.drain();
    });
});

describe('cors', () => {
    it('answers a preflight when configured', async () => {
        const { app } = createTestApp({ cors: { origin: 'https://ui.test' } });
        const response = await send(app, '/runs', {
            method: 'OPTIONS',
            headers: { origin: 'https://ui.test', 'access-control-request-method': 'GET' },
        });
        expect(response.status).toBe(204);
        expect(response.headers.get('access-control-allow-origin')).toBe('https://ui.test');
    });

    it('is off by default', async () => {
        const { app } = createTestApp();
        const response = await send(app, '/agents', { token: ADMIN_TOKEN, headers: { origin: 'https://ui.test' } });
        expect(response.headers.get('access-control-allow-origin')).toBeNull();
    });

    it('never rate limits a preflight', async () => {
        const { app } = createTestApp({ cors: { origin: 'https://ui.test' }, rateLimit: { max: 1 } });
        for (let i = 0; i < 3; i++) {
            const response = await send(app, '/runs', {
                method: 'OPTIONS',
                headers: { origin: 'https://ui.test', 'access-control-request-method': 'GET' },
            });
            expect(response.status).toBe(204);
        }
        expect((await send(app, '/agents', { token: ADMIN_TOKEN })).status).toBe(200);
    });
});

describe('rate limit', () => {
    it('answers 429 JSON over the limit', async () => {
        const { app } = createTestApp({ rateLimit: { max: 2 } });
        expect((await send(app, '/agents', { token: ADMIN_TOKEN })).status).toBe(200);
        expect((await send(app, '/agents', { token: ADMIN_TOKEN })).status).toBe(200);
        const limited = await send(app, '/agents', { token: ADMIN_TOKEN });
        expect(limited.status).toBe(429);
        expect(await limited.json()).toEqual({
            status: 429,
            code: 'too_many_requests',
            message: 'Too many requests, please try again later.',
        });
    });

    it('keys by client address', async () => {
        const { app } = createTestApp({ rateLimit: { max: 1 } });
        expect((await send(app, '/agents', { token: ADMIN_TOKEN, ip: '10.0.0.1' })).status).toBe(200);
        expect((await send(app, '/agents', { token: ADMIN_TOKEN, ip: '10.0.0.2' })).status).toBe(200);
        expect((await send(app, '/agents', { token: ADMIN_TOKEN, ip: '10.0.0.1' })).status).toBe(429);
    });

    it('skips health and metrics', async () => {
        const { app } = createTestApp({ rateLimit: { max: 2 }, metrics: undefined });
        for (let i = 0; i < 5; i++) {
            expect((await send(app, '/healthz')).status).toBe(200);
            expect((await send(app, '/readyz')).status).toBe(200);
            expect((await send(app, '/metrics')).status).toBe(200);
        }
    });

    it('skips health under a basePath', async () => {
        const { app } = createTestApp({ rateLimit: { max: 1 }, basePath: '/api' });
        for (let i = 0; i < 3; i++) expect((await send(app, '/api/healthz')).status).toBe(200);
    });

    it('is off with rateLimit: false', async () => {
        const { app } = createTestApp({ rateLimit: false });
        for (let i = 0; i < 10; i++) expect((await send(app, '/agents', { token: ADMIN_TOKEN })).status).toBe(200);
    });

    it('ignores a rotating X-Forwarded-For unless trustProxy is set', async () => {
        const spoof = async (app: App) => {
            const statuses: number[] = [];
            for (let n = 1; n <= 3; n++) {
                statuses.push((await send(app, '/agents', {
                    token: ADMIN_TOKEN,
                    headers: { 'x-forwarded-for': `1.2.3.${n}` },
                })).status);
            }
            return statuses;
        };

        expect(await spoof(createTestApp({ rateLimit: { max: 2 } }).app)).toEqual([200, 200, 429]);
        expect(await spoof(createTestApp({ rateLimit: { max: 2 }, trustProxy: true }).app)).toEqual([200, 200, 200]);
    });
});
