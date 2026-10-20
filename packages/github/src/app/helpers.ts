/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError } from '@chamberu/core';
import { Octokit } from '@octokit/core';
import { paginateRest } from '@octokit/plugin-paginate-rest';

export const PaginatedOctokit = Octokit.plugin(paginateRest);

/** The webhook secrets as a non-empty list of non-empty strings. */
export function normalizeSecrets(input: string | readonly string[]): string[] {
    const secrets = typeof input === 'string' ? [input] : [...input];
    if (secrets.length === 0 || secrets.some((secret) => typeof secret !== 'string' || secret.length === 0)) {
        throw new InvalidAgentDefinitionError('webhookSecret must be a non-empty string or a non-empty list of them.');
    }
    return secrets;
}

/** The App id as a non-empty string. */
export function normalizeAppId(input: string | number): string {
    const appId = String(input).trim();
    if (appId.length === 0) throw new InvalidAgentDefinitionError('appId must not be empty.');
    return appId;
}

/** A positive integer installation id or `undefined`. */
export function normalizeInstallationId(input: number | undefined): number | undefined {
    if (input === undefined) return undefined;
    if (!Number.isSafeInteger(input) || input < 1) {
        throw new InvalidAgentDefinitionError(`installationId must be a positive integer, got ${input}.`);
    }
    return input;
}
