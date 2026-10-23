/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { LogLevel } from './types.ts';

export const DEFAULT_PORT = 3000;
export const DEFAULT_HOST = '0.0.0.0';
export const DEFAULT_PURGE_INTERVAL_MS = 3_600_000;
export const DEFAULT_MAX_CONCURRENT_RUNS = 4;
export const DEFAULT_READINESS_DELAY_MS = 0;
export const DEFAULT_DRAIN_TIMEOUT_MS = 30_000;
export const DEV_DRAIN_TIMEOUT_MS = 5_000;
export const DEFAULT_CLOSE_TIMEOUT_MS = 5_000;
export const DEFAULT_AGENTS_POLL_MS = 5_000;
export const BASE_PATH_PATTERN = /^(?:\/[a-z0-9._~-]+)+$/;
export const LOG_LEVELS: readonly LogLevel[] = ['error', 'warn', 'info', 'debug'];
export const DATABASE_URL_PROTOCOLS: readonly string[] = ['postgres:', 'postgresql:'];
export const PUBLIC_URL_PROTOCOLS: readonly string[] = ['http:', 'https:'];
/** @chamvi/http's staticTokens() rule. */
export const TOKEN_VALUE_MIN_LENGTH = 16;
