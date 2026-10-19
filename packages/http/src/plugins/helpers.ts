/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IAppEvent } from 'routup';

/** `event.path` without the `basePath` prefix. */
function routePath(event: IAppEvent, basePath: string): string {
    const { path } = event;
    if (basePath && (path === basePath || path.startsWith(`${basePath}/`))) {
        return path.slice(basePath.length) || '/';
    }
    return path;
}

/** `GET <basePath>/runs/:id/stream`: minute-long SSE connections skew request timings. */
export function isStreamRequest(event: IAppEvent, basePath: string): boolean {
    return event.method === 'GET' && /^\/runs\/[^/]+\/stream\/?$/.test(routePath(event, basePath));
}

/** `/healthz`, `/readyz` and the metrics path (under `basePath`): never rate limited. */
export function isOperationalPath(event: IAppEvent, basePath: string, metricsPath: string): boolean {
    const path = routePath(event, basePath).replace(/\/+$/, '') || '/';
    return path === '/healthz' || path === '/readyz' || path === metricsPath;
}

/** The routes of the app as metric labels, matched against the path without `basePath`; keep in step with the route modules. */
const ROUTE_TEMPLATES: Array<[RegExp, string]> = [
    [/^\/(?:healthz|readyz|agents|schedules|runs|resume|mcp)$/, ''],
    [/^\/runs\/[^/]+$/, '/runs/:id'],
    [/^\/runs\/[^/]+\/stream$/, '/runs/:id/stream'],
    [/^\/runs\/[^/]+\/cancel$/, '/runs/:id/cancel'],
    [/^\/agents\/[^/]+\/runs$/, '/agents/:name/runs'],
    [/^\/agents\/[^/]+\/state\/kv\/[^/]+$/, '/agents/:name/state/kv/:key'],
    [/^\/agents\/[^/]+\/state\/collections\/[^/]+$/, '/agents/:name/state/collections/:collection'],
    [/^\/hooks\/[^/]+(?:\/.*)?$/, '/hooks/:agent/*'],
];

/** Every request that matches no route shares this label. */
const UNMATCHED_ROUTE_LABEL = '/_unmatched';

/**
 * The `path` label of a request: its route template (`/runs/:id`), so ids,
 * keys and unknown paths cannot mint a series each.
 */
export function routeLabel(event: IAppEvent, basePath: string, metricsPath: string): string {
    const path = routePath(event, basePath).replace(/\/+$/, '') || '/';
    if (path === metricsPath) return path;
    for (const [pattern, template] of ROUTE_TEMPLATES) {
        if (pattern.test(path)) return template || path;
    }
    return UNMATCHED_ROUTE_LABEL;
}
