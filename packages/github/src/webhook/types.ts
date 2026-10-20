/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export type GithubWebhookRouteOptions = {
    /** Default DEFAULT_WEBHOOK_PATH ('/webhooks/github'), under the http app's `basePath`. */
    path?: string;
};

/** The `202` answer to a delivery: the run each matching agent got (deduplicated on a redelivery). */
export type GithubWebhookResult = {
    delivery: string;
    runs: Array<{
        agent: string;
        runId: string;
        deduplicated: boolean;
    }>;
};
