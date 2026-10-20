/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** `X-GitHub-Event`: GitHub's event names are lower case, digits (`projects_v2_item`) and underscores. */
export const EVENT_HEADER_PATTERN = /^[a-z0-9_]+$/;

/** `X-Hub-Signature-256`: `sha256=` and 64 lower-case hex digits. */
export const SIGNATURE_PATTERN = /^sha256=([0-9a-f]{64})$/;
