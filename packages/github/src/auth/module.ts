/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { KeyObject } from 'node:crypto';
import type { IClock } from '@chamberu/core';
import { PaginatedOctokit } from '../app/helpers.ts';
import type { GithubOctokit } from '../app/types.ts';
import { GITHUB_USER_AGENT, TOKEN_REFRESH_MARGIN_MS } from './constants.ts';
import { createAppJwt } from './helpers.ts';

type CachedToken = { token: string; expiresAt: number };

type InstallationTokensInput = {
    appId: string;
    key: KeyObject;
    clock: IClock;
    baseUrl: string;
    fetch?: typeof globalThis.fetch;
};

/**
 * Installation tokens per installation, cached until TOKEN_REFRESH_MARGIN_MS
 * before they expire (on the `IClock`). Concurrent callers share one
 * exchange; a failed exchange is not cached.
 */
export function createInstallationTokens(input: InstallationTokensInput): {
    get(installationId: number): Promise<string>;
    app(): Promise<GithubOctokit>;
} {
    const cache = new Map<number, CachedToken>();
    const pending = new Map<number, Promise<string>>();
    const request = input.fetch ? { fetch: input.fetch } : {};

    /** An Octokit authenticated as the App (a fresh JWT). */
    async function app(): Promise<GithubOctokit> {
        return new PaginatedOctokit({
            auth: createAppJwt(input.appId, input.key, input.clock.now()),
            baseUrl: input.baseUrl,
            userAgent: GITHUB_USER_AGENT,
            request,
        });
    }

    async function exchange(installationId: number): Promise<string> {
        const octokit = await app();
        const { data } = await octokit.request('POST /app/installations/{installation_id}/access_tokens', { installation_id: installationId });
        cache.set(installationId, { token: data.token, expiresAt: Date.parse(data.expires_at) });
        return data.token;
    }

    return {
        app,
        get(installationId: number): Promise<string> {
            const cached = cache.get(installationId);
            if (cached && input.clock.now().getTime() < cached.expiresAt - TOKEN_REFRESH_MARGIN_MS) {
                return Promise.resolve(cached.token);
            }
            let inflight = pending.get(installationId);
            if (!inflight) {
                inflight = exchange(installationId).finally(() => pending.delete(installationId));
                pending.set(installationId, inflight);
            }
            return inflight;
        },
    };
}
