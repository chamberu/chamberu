/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ToolSet } from 'ai';
import { ChamberuError, systemClock } from '@chamberu/core';
import { GITHUB_USER_AGENT } from '../auth/constants.ts';
import { normalizePrivateKey } from '../auth/helpers.ts';
import { createInstallationTokens } from '../auth/module.ts';
import {
    PaginatedOctokit,
    normalizeAppId,
    normalizeBaseUrl,
    normalizeInstallationId,
    normalizeSecrets,
    normalizeSlug,
} from './helpers.ts';
import { createReadTools } from '../tools/read.ts';
import { GITHUB_REQUEST_ERROR_CODE } from '../tools/constants.ts';
import { createWriteTools } from '../tools/write.ts';
import { verifySignature } from '../webhook/helpers.ts';
import { createWebhookRoute } from '../webhook/module.ts';
import type { GithubWebhookRouteOptions } from '../webhook/types.ts';
import type { GithubAppOptions, GithubOctokit, IGithubApp } from './types.ts';

/**
 * A GitHub App: installation Octokits over an `IClock`-based token cache
 * and the App's bot login. Validates the options eagerly
 * (`InvalidAgentDefinitionError`).
 */
export function createGithubApp(options: GithubAppOptions): IGithubApp {
    const appId = normalizeAppId(options.appId);
    const key = normalizePrivateKey(options.privateKey);
    const secrets = normalizeSecrets(options.webhookSecret);
    const installationId = normalizeInstallationId(options.installationId);
    const slug = normalizeSlug(options.slug);
    const clock = options.clock ?? systemClock;
    const baseUrl = normalizeBaseUrl(options.baseUrl);
    const request = options.fetch ? { fetch: options.fetch } : {};

    const tokens = createInstallationTokens({
        appId,
        key,
        clock,
        baseUrl,
        fetch: options.fetch,
    });

    let login: Promise<string> | undefined = slug ? Promise.resolve(`${slug}[bot]`) : undefined;

    const app: IGithubApp = {
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
                        if (typeof data?.slug !== 'string' || data.slug.length === 0) {
                            // a login of `[bot]` would never match and disable the self-sender guard
                            throw new ChamberuError({ message: 'GET /app answered without the App slug; set slug on createGithubApp().', code: GITHUB_REQUEST_ERROR_CODE });
                        }
                        return `${data.slug}[bot]`;
                    })
                    .catch((error: unknown) => {
                        login = undefined;
                        throw error;
                    });
            }
            return login;
        },
        verifySignature(body: Uint8Array, signature: string | null): boolean {
            return verifySignature(secrets, body, signature);
        },
        webhookRoute(routeOptions?: GithubWebhookRouteOptions) {
            return createWebhookRoute(app, routeOptions);
        },
        readTools(): ToolSet {
            return createReadTools(app);
        },
        writeTools(): ToolSet {
            return createWriteTools(app);
        },
    };
    return app;
}
