/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { TooManyRequestsError } from '@ebec/http';
import { cors } from '@routup/cors';
import { prometheus } from '@routup/prometheus';
import { rateLimit } from '@routup/rate-limit';
import { Registry } from 'prom-client';
import { getRequestIP } from 'routup';
import type { App } from 'routup';
import {
    DEFAULT_METRICS_PATH,
    DEFAULT_RATE_LIMIT_MAX,
    DEFAULT_RATE_LIMIT_WINDOW_MS,
} from '../app/constants.ts';
import type { HttpAppOptions } from '../app/types.ts';
import { isOperationalPath, isStreamRequest } from './helpers.ts';

/**
 * CORS (only when configured), Prometheus at `/metrics` with a registry
 * of its own, and a rate limit keyed by the client address as the App's
 * `trustProxy` resolves it (never a raw `X-Forwarded-For`). Installed
 * before any route.
 */
export function installPlugins(app: App, options: HttpAppOptions): void {
    const basePath = options.basePath ?? '';

    if (options.cors) app.use(cors(options.cors));

    const metricsPath = options.metrics === false ?
        undefined :
        options.metrics?.metricsPath ?? DEFAULT_METRICS_PATH;
    if (options.metrics !== false) {
        app.use(prometheus({
            metricsPath,
            // the global default registry throws on a second app in one process
            registry: new Registry(),
            skip: (event) => isStreamRequest(event, basePath),
            ...options.metrics,
        }));
    }

    if (options.rateLimit !== false) {
        app.use(rateLimit({
            windowMs: DEFAULT_RATE_LIMIT_WINDOW_MS,
            max: DEFAULT_RATE_LIMIT_MAX,
            // the library default trusts any X-Forwarded-For
            keyGenerator: (event) => getRequestIP(event) ?? 'unknown',
            skip: (event) => event.method === 'OPTIONS' || isOperationalPath(event, basePath, metricsPath ?? ''),
            handler: () => {
                throw new TooManyRequestsError({ message: 'Too many requests, please try again later.' });
            },
            ...options.rateLimit,
        }));
    }
}
