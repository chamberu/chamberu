/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** `iat` lies this far in the past, for clock drift between us and GitHub. */
export const JWT_BACKDATE_SECONDS = 60;

/** `exp` lies this far ahead; GitHub accepts at most 10 minutes. */
export const JWT_TTL_SECONDS = 540;

/** An installation token is replaced this long before it expires. */
export const TOKEN_REFRESH_MARGIN_MS = 5 * 60_000;

/** The User-Agent of every GitHub request. */
export const GITHUB_USER_AGENT = 'chamberu';
