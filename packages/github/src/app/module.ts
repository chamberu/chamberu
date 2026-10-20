/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { systemClock } from '@chamberu/core';
import { GITHUB_USER_AGENT } from '../auth/constants.ts';
import { normalizePrivateKey } from '../auth/helpers.ts';
import { createInstallationTokens } from '../auth/module.ts';
import { DEFAULT_GITHUB_API_URL } from './constants.ts';
import {
    PaginatedOctokit,
    normalizeAppId,
    normalizeInstallationId,
    normalizeSecrets,
} from './helpers.ts';
import type { GithubAppOptions, GithubOctokit, IGithubApp } from './types.ts';

/**
 * A GitHub App: installation Octokits over an `IClock`-based token cache
 * and the App's bot login. Validates the options eagerly
 * (`InvalidAgentDefinitionError`).
 */
export function createGithubApp(options: GithubAppOptions): IGithubApp {
    const appId = normalizeAppId(options.appId);
    const key = normalizePrivateKey(options.privateKey);
    normalizeSecrets(options.webhookSecret);
    const installationId = normalizeInstallationId(options.installationId);
    const clock = options.clock ?? systemClock;
    const baseUrl = (options.baseUrl ?? DEFAULT_GITHUB_API_URL).replace(/\/+$/, '');
    const request = options.fetch ? { fetch: options.fetch } : {};

    const tokens = createInstallationTokens({
        appId,
        key,
        clock,
        baseUrl,
        fetch: options.fetch,
    });

    let login: Promise<string> | undefined = options.slug ? Promise.resolve(`${options.slug}[bot]`) : undefined;

    return {
        appId,
        ...(installationId !== undefined ? { installationId } : {}),
        async octokit(id: number): Promise<GithubOctokit> {
            const token = await tokens.get(id);
            return new PaginatedOctokit({
                auth: token,
                baseUrl,
                userAgent: GITHUB_USER_AGENT,
                request,
            });
        },
        botLogin(): Promise<string> {
            if (!login) {
                login = tokens.app()
                    .then(async (octokit) => {
                        const { data } = await octokit.request('GET /app');
                        return `${data?.slug ?? ''}[bot]`;
                    })
                    .catch((error: unknown) => {
                        login = undefined;
                        throw error;
                    });
            }
            return login;
        },
    };
}
