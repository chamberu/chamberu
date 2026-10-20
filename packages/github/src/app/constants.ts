/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** Where `webhookRoute()` listens by default, under the http app's `basePath`. */
export const DEFAULT_WEBHOOK_PATH = '/webhooks/github';

/** GitHub's REST API; GitHub Enterprise Server uses `https://<host>/api/v3`. */
export const DEFAULT_GITHUB_API_URL = 'https://api.github.com';
