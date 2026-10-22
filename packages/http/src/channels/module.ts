/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { defineCoreHandler } from 'routup';
import type { App } from 'routup';
import type { HttpContext } from '../app/types.ts';
import { routeSubpath } from '../routes/helpers.ts';
import { CHANNELS_SEGMENT } from './constants.ts';
import { createChannelContext } from './helpers.ts';

/**
 * Mounts `POST /channels/<name>` and `POST /channels/<name>/...` for each
 * channel the app lists, unauthenticated (each channel checks its own
 * credentials) and rate-limited. `in` gets the raw request (body unread)
 * and the raw subpath (`''` for the bare path, else starting with `/`,
 * still percent-encoded); its Response is sent as is, a thrown error renders
 * through the JSON error handler. Any other `/channels/...` request is 404.
 */
export function registerChannelRoutes(app: App, ctx: HttpContext): void {
    for (const channel of ctx.channels) {
        const path = `/${CHANNELS_SEGMENT}/${channel.name}`;
        const channelCtx = createChannelContext(ctx.engine, channel);
        const handler = defineCoreHandler((event) => channel.in!({
            request: event.request,
            subpath: routeSubpath(new URL(event.request.url).pathname, ctx.basePath, path),
        }, channelCtx));
        app.post(path, handler);
        app.post(`${path}{/*rest}`, handler);
    }
}
