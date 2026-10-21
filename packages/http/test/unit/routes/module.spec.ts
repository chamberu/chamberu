/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { UnauthorizedError } from '@ebec/http';
import { describe, expect, it } from 'vitest';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import type { HttpRoute, HttpRouteContext, HttpRouteRequest } from '@chamvi/http';
import type { App } from 'routup';
import { createTestApp } from '../../utils/app.ts';

type SendOptions = {
    method?: string;
    body?: string;
    contentType?: string;
};

/** A request with a socket address (the rate limiter keys by it). */
function send(app: App, path: string, options: SendOptions = {}): Promise<Response> {
    const headers = new Headers();
    if (options.body !== undefined) headers.set('content-type', options.contentType ?? 'application/json');
    const request = new Request(`http://test${path}`, {
        method: options.method ?? 'POST',
        headers,
        body: options.body,
    });
    (request as Request & { ip?: string }).ip = '10.0.0.1';
    return app.fetch(request);
}

function route(overrides: Partial<HttpRoute> = {}): HttpRoute {
    return {
        method: 'POST',
        path: '/extra',
        handler: async () => ({ status: 202, body: { ok: true } }),
        ...overrides,
    };
}

describe('extra routes', () => {
    it('serves an extra route under basePath', async () => {
        const { app } = createTestApp({ basePath: '/api', routes: [route()] });
        const response = await send(app, '/api/extra');
        expect(response.status).toBe(202);
        expect(await response.json()).toEqual({ ok: true });
    });

    it('hands the route context', async () => {
        let seen: HttpRouteContext | undefined;
        const {
            app, 
            engine, 
            clock, 
        } = createTestApp({
            routes: [route({
                handler: async (_request, ctx) => {
                    seen = ctx;
                    return { status: 204 };
                },
            })],
        });
        await send(app, '/extra');
        expect(seen?.engine).toBe(engine);
        expect(seen?.clock).toBe(clock);
        expect(seen?.agents.map((agent) => agent.name)).toEqual(['echo']);
        expect(seen?.onError).toBeTypeOf('function');
    });

    it('hands a request without the body, so readBody() is the only way in', async () => {
        let body: unknown;
        let method: string | undefined;
        let contentType: string | null | undefined;
        const { app } = createTestApp({
            routes: [route({
                handler: async ({ request }) => {
                    body = request.body;
                    method = request.method;
                    contentType = request.headers.get('content-type');
                    return { status: 204 };
                },
            })],
        });
        await send(app, '/extra', { body: '{"a":1}' });
        expect(body).toBeNull();
        expect(method).toBe('POST');
        expect(contentType).toBe('application/json');
    });

    it('returns the same bytes from repeated readBody() calls', async () => {
        const texts: string[] = [];
        const { app } = createTestApp({
            routes: [route({
                handler: async ({ readBody }) => {
                    const decoder = new TextDecoder();
                    texts.push(decoder.decode(await readBody()), decoder.decode(await readBody()));
                    return { status: 204 };
                },
            })],
        });
        const response = await send(app, '/extra', { body: '{"a":1}' });
        expect(response.status).toBe(204);
        expect(texts).toEqual(['{"a":1}', '{"a":1}']);
    });

    it('answers a body-less result', async () => {
        const { app } = createTestApp({ routes: [route({ handler: async () => ({ status: 204 }) })] });
        const response = await send(app, '/extra');
        expect(response.status).toBe(204);
        expect(await response.text()).toBe('');
    });

    it('skips the rate limiter for rateLimit: false', async () => {
        const { app } = createTestApp({
            rateLimit: { max: 1 },
            routes: [
                route({ path: '/open', rateLimit: false }),
                route({ path: '/limited' }),
            ],
        });
        expect((await send(app, '/open')).status).toBe(202);
        expect((await send(app, '/open')).status).toBe(202);
        expect((await send(app, '/limited')).status).toBe(202);
        expect((await send(app, '/limited')).status).toBe(429);
    });

    it('skips the rate limiter whatever the case of the request path (routup matches case-insensitively)', async () => {
        const { app } = createTestApp({
            basePath: '/api',
            rateLimit: { max: 1 },
            routes: [
                route({ path: '/open', rateLimit: false }),
                route({ path: '/Mixed', rateLimit: false }),
            ],
        });
        expect((await send(app, '/API/Open')).status).toBe(202);
        expect((await send(app, '/api/OPEN')).status).toBe(202);
        expect((await send(app, '/api/mixed')).status).toBe(202);
        expect((await send(app, '/Api/MIXED')).status).toBe(202);
    });

    it('hands the raw body bytes', async () => {
        let received: string | undefined;
        const { app } = createTestApp({
            routes: [route({
                handler: async (request: HttpRouteRequest) => {
                    received = new TextDecoder().decode(await request.readBody());
                    return { status: 202 };
                },
            })],
        });
        const body = '{"a":"é", "b" : "\\u00e9"}';
        expect((await send(app, '/extra', { body })).status).toBe(202);
        expect(received).toBe(body);
    });

    it('reads an empty body as zero bytes', async () => {
        let size: number | undefined;
        const { app } = createTestApp({
            routes: [route({
                handler: async (request) => {
                    size = (await request.readBody()).byteLength;
                    return { status: 202 };
                },
            })],
        });
        expect((await send(app, '/extra')).status).toBe(202);
        expect(size).toBe(0);
    });

    it('answers 415 for a form body', async () => {
        const reading = route({
            handler: async (request) => {
                await request.readBody();
                return { status: 202 };
            },
        });
        const { app } = createTestApp({ routes: [reading] });
        const response = await send(app, '/extra', {
            body: 'payload=x',
            contentType: 'application/x-www-form-urlencoded',
        });
        expect(response.status).toBe(415);
        expect(await response.json()).toMatchObject({ status: 415, code: 'unsupported_media_type' });
    });

    it('answers 413 above bodyLimit', async () => {
        const reading = route({
            handler: async (request) => {
                await request.readBody();
                return { status: 202 };
            },
        });
        const { app } = createTestApp({ bodyLimit: 8, routes: [reading] });
        const response = await send(app, '/extra', { body: '{"a":"0123456789"}' });
        expect(response.status).toBe(413);
        const body = await response.json() as Record<string, unknown>;
        expect(body).toMatchObject({ status: 413 });
        expect(Object.keys(body).sort()).toEqual(['code', 'message', 'status']);
    });

    it('renders thrown http errors', async () => {
        const { app } = createTestApp({
            routes: [route({
                handler: async () => {
                    throw new UnauthorizedError({ message: 'bad signature' });
                },
            })],
        });
        const response = await send(app, '/extra');
        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({
            status: 401, 
            code: 'unauthorized', 
            message: 'bad signature', 
        });
    });

    it('renders other errors as 500 and reports them', async () => {
        const errors: unknown[] = [];
        const { app } = createTestApp({
            onError: (error) => { errors.push(error); },
            routes: [route({
                handler: async () => {
                    throw new Error('boom');
                },
            })],
        });
        const response = await send(app, '/extra');
        expect(response.status).toBe(500);
        expect(await response.json()).toMatchObject({ status: 500, message: 'Internal Server Error' });
        expect(errors).toHaveLength(1);
    });

    it.each([
        ['a path without a leading slash', [route({ path: 'extra' })]],
        ['a path with a parameter', [route({ path: '/extra/:id' })]],
        ['a path with a wildcard', [route({ path: '/extra/*' })]],
        ['a path with a brace', [route({ path: '/extra{/x}' })]],
        ['a duplicate method and path', [route(), route()]],
        ...['agents', 'runs', 'resume', 'hooks', 'mcp', 'healthz', 'readyz', 'schedules']
            .map((segment): [string, HttpRoute[]] => [`the reserved segment ${segment}`, [route({ path: `/${segment}/x` })]]),
        ['the metrics path', [route({ method: 'GET', path: '/metrics' })]],
        ['a reserved segment in another case', [route({ path: '/AGENTS/x' })]],
        ['the metrics path in another case', [route({ method: 'GET', path: '/Metrics' })]],
        ['a duplicate path in another case', [route(), route({ path: '/EXTRA' })]],
    ])('refuses %s at construction', (_name, routes) => {
        expect(() => createTestApp({ metrics: undefined, routes })).toThrow(InvalidAgentDefinitionError);
    });

    it('accepts the same path under two methods', () => {
        expect(() => createTestApp({ routes: [route(), route({ method: 'GET' })] })).not.toThrow();
    });
});
