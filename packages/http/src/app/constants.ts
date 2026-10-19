/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** Bytes a REST or MCP request body may have. */
export const DEFAULT_BODY_LIMIT = 1_048_576;

/** How often an SSE stream polls the store for runs executing elsewhere. */
export const DEFAULT_STREAM_POLL_MS = 2_000;

/** How long `/readyz` waits for the store. */
export const DEFAULT_READY_TIMEOUT_MS = 2_000;

/** Page size of `GET /runs`, MCP `list_runs` and state collection lists without `page[limit]`. */
export const DEFAULT_PAGE_LIMIT = 50;

/** Largest `page[limit]` a list accepts. */
export const MAX_PAGE_LIMIT = 100;
