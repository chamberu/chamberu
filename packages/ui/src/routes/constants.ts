/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export const DEFAULT_UI_BASE_PATH = '/ui';

/** Hashed assets (`assets/`) never change under their name. */
export const ASSET_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/** `index.html` and unhashed files revalidate on every load. */
export const DOCUMENT_CACHE_CONTROL = 'no-cache';

/** @internal */
export const MEDIA_TYPES: Readonly<Record<string, string>> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.map': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.txt': 'text/plain; charset=utf-8',
};

/** @internal How long a missing build is answered from memory before the folder is read again. */
export const BUILD_RETRY_MS = 5000;

/** @internal */
export const DEFAULT_MEDIA_TYPE = 'application/octet-stream';

/** @internal On every answer of the dashboard, next to the CSP. */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
    'x-content-type-options': 'nosniff',
    // a deep link's resume token must never leave as a referrer
    'referrer-policy': 'no-referrer',
    'x-frame-options': 'DENY',
};

/** @internal Lower case only: routup matches case-insensitively and the path is echoed into `<base>`. */
export const UI_BASE_PATH_PATTERN = /^(?:\/[a-z0-9._~-]+)+$/;
