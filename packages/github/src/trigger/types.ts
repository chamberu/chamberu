/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** The parts of a GitHub webhook body chamberu reads; the rest passes through. */
export type GithubPayload = {
    action?: string;
    installation?: { id: number };
    repository?: { full_name: string; [key: string]: unknown };
    sender?: {
        login: string; 
        type: string; 
        [key: string]: unknown 
    };
    issue?: { number: number; [key: string]: unknown };
    pull_request?: { number: number; [key: string]: unknown };
    [key: string]: unknown;
};

/** The envelope payload of a `source: 'github'` run. */
export type GithubEvent = {
    /** X-GitHub-Event, e.g. 'issues'. */
    name: string;
    action?: string;
    /** X-GitHub-Delivery. */
    delivery: string;
    installationId?: number;
    payload: GithubPayload;
};

export type GithubWebhookTriggerOptions = {
    /** 'issues' (every action) or 'issues.opened'; at least one. */
    events: readonly string[];
    /** Default `github:<events joined by ','>`. */
    id?: string;
    /** Runs after the event match; a delivery it refuses starts no run of this trigger. */
    filter?: (event: GithubEvent) => boolean;
    /**
     * Default: the delivery id (applied by the route). The signature does not
     * cover that header, so a replayed body under a new id is a new run;
     * derive the key from the content on an exposed endpoint.
     */
    idempotencyKey?: (event: GithubEvent) => string | undefined;
    /** Default: `<full_name>#<issue|pull_request number>`, else `<full_name>`. */
    concurrencyKey?: (event: GithubEvent) => string | undefined;
};
