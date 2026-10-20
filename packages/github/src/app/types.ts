/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock } from '@chamberu/core';
import type { PaginatedOctokit } from './helpers.ts';

export type GithubAppOptions = {
    appId: string | number;
    /** PEM (PKCS#1 or PKCS#8); literal "\n" sequences become newlines. */
    privateKey: string;
    /** Several during a secret rotation; a delivery verifies under any. */
    webhookSecret: string | readonly string[];
    /** For runs not started by a delivery (cron, http, mcp). */
    installationId?: number;
    /** The App's slug; skips `GET /app` for the bot login. */
    slug?: string;
    /** Default DEFAULT_GITHUB_API_URL ('https://api.github.com'). */
    baseUrl?: string;
    clock?: IClock;
    fetch?: typeof globalThis.fetch;
};

/** An Octokit (`@octokit/core` with `paginate`). */
export type GithubOctokit = InstanceType<typeof PaginatedOctokit>;

export interface IGithubApp {
    readonly appId: string;
    readonly installationId?: number;
    /** An Octokit authenticated as the installation (cached token). */
    octokit(installationId: number): Promise<GithubOctokit>;
    /** `<slug>[bot]`, from `slug` or one `GET /app`; cached, single-flight. */
    botLogin(): Promise<string>;
}
