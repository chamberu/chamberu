/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { defineCoreHandler } from 'routup';
import type { App, IAppEvent } from 'routup';
import type { HttpContext, HttpRouteContext, HttpRouteRequest } from '../app/types.ts';
import { assertContentLength, isJsonMediaType, readBodyBytes } from '../request/helpers.ts';

/**
 * The route's view of the request: URL, method, headers and signal without
 * the body, so the limited `readBody()` (memoized: every call gets the same
 * bytes) is the only way to it.
 */
function toRouteRequest(event: IAppEvent, ctx: HttpContext): HttpRouteRequest {
    const { request } = event;
    let body: Promise<Uint8Array> | undefined;
    return {
        request: new Request(request.url, {
            method: request.method,
            headers: request.headers,
            signal: request.signal,
        }),
        readBody: () => {
            body ??= (async () => {
                assertContentLength(event, ctx.bodyLimit);
                return readBodyBytes(event, ctx.bodyLimit, isJsonMediaType(request.headers.get('content-type')));
            })();
            return body;
        },
    };
}

/**
 * Serves the app's extra routes (`HttpAppOptions.routes`), unauthenticated:
 * each route checks its own credentials. A result without `body` answers
 * an empty body (routup waits forever on a handler returning `undefined`).
 */
export function registerRoutes(app: App, ctx: HttpContext): void {
    const routeCtx: HttpRouteContext = {
        engine: ctx.engine,
        agents: ctx.agents.values().toArray(),
        clock: ctx.clock,
        onError: ctx.onError,
    };

    for (const route of ctx.routes) {
        const handler = defineCoreHandler(async (event) => {
            const result = await route.handler(toRouteRequest(event, ctx), routeCtx);
            event.response.status = result.status;
            return result.body === undefined ? null : result.body;
        });
        switch (route.method) {
            case 'GET':
                app.get(route.path, handler);
                break;
            case 'PUT':
                app.put(route.path, handler);
                break;
            case 'PATCH':
                app.patch(route.path, handler);
                break;
            case 'DELETE':
                app.delete(route.path, handler);
                break;
            default:
                app.post(route.path, handler);
        }
    }
}
