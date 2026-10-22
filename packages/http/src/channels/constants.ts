/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** The channel REST starts (`POST /agents/:name/runs`) dispatch as; `http.on()` subscribes to it. */
export const HTTP_CHANNEL_NAME = 'http';

/** The channel MCP `run_<agent>` starts dispatch as (an agent's `http.on()` subscription offers the tool). */
export const MCP_CHANNEL_NAME = 'mcp';

/** The default webhook channel's name; `webhook.on()` subscribes to it. */
export const WEBHOOK_CHANNEL_NAME = 'webhook';

/** The first path segment the http app mounts channels under: `/channels/<name>`. */
export const CHANNELS_SEGMENT = 'channels';
