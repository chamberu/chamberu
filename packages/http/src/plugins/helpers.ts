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
