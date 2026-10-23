/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IChannel } from '@chamvi/core';
import { HTTP_CHANNEL_NAME, MCP_CHANNEL_NAME } from './constants.ts';

/**
 * The `http` channel: REST `POST /agents/:name/runs` (and the UI) dispatch
 * as it, with the authenticated principal as invoker. No `in` (the REST
 * route is the intake) and no `out`; registered on the engine so that
 * `http.on()` subscriptions validate.
 */
export function httpChannel(): IChannel {
    return { name: HTTP_CHANNEL_NAME };
}

/**
 * The `mcp` channel: MCP `run_<agent>` dispatches as it (offered for an
 * agent with an `http.on()` subscription), so MCP and REST starts keep
 * separate idempotency scopes. No `in`, no `out`.
 */
export function mcpChannel(): IChannel {
    return { name: MCP_CHANNEL_NAME };
}
