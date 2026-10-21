/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError } from '@chamvi/core';
import { createGithubApp } from '@chamvi/github';
import type { GithubAppOptions, IGithubApp } from '@chamvi/github';
import {
    envInteger,
    envList,
    envString,
    envUrl,
} from '../env/module.ts';
import type { Env } from '../env/types.ts';

/** The env variable each createGithubApp option is read from. */
const VARIABLES = {
    appId: 'GITHUB_APP_ID',
    privateKey: 'GITHUB_APP_PRIVATE_KEY',
    webhookSecret: 'GITHUB_WEBHOOK_SECRET',
    installationId: 'GITHUB_INSTALLATION_ID',
    slug: 'GITHUB_APP_SLUG',
    baseUrl: 'GITHUB_API_URL',
} as const satisfies Partial<Record<keyof GithubAppOptions, string>>;

type EnvOption = keyof typeof VARIABLES;

/**
 * createGithubApp() over env (C4), explicit options winning; only the options
 * not given are read. An option error for a value read from env names the
 * variable instead (createGithubApp's messages never echo a key or secret).
 */
export function createGithubAppFromEnv(env: Env, options: Partial<GithubAppOptions>): IGithubApp {
    const fromEnv = new Set<EnvOption>();
    const read = <K extends EnvOption>(key: K, reader: () => GithubAppOptions[K] | undefined): GithubAppOptions[K] | undefined => {
        if (typeof options[key] !== 'undefined') {
            return options[key];
        }
        fromEnv.add(key);
        return reader();
    };

    const appId = read('appId', () => envString(env, VARIABLES.appId, { required: true }));
    const privateKey = read('privateKey', () => envString(env, VARIABLES.privateKey, { required: true }));
    const webhookSecret = read('webhookSecret', () => envList(env, VARIABLES.webhookSecret, { required: true }));
    const installationId = read('installationId', () => envInteger(env, VARIABLES.installationId, { min: 1 }));
    const slug = read('slug', () => envString(env, VARIABLES.slug));
    const baseUrl = read('baseUrl', () => envUrl(env, VARIABLES.baseUrl, { protocols: ['https:'] }));

    try {
        return createGithubApp({
            ...options,
            appId: appId!,
            privateKey: privateKey!,
            webhookSecret: webhookSecret!,
            ...(typeof installationId !== 'undefined' && { installationId }),
            ...(typeof slug !== 'undefined' && { slug }),
            ...(typeof baseUrl !== 'undefined' && { baseUrl }),
        });
    } catch (error) {
        if (error instanceof InvalidAgentDefinitionError) {
            const key = [...fromEnv].find((option) => error.message.startsWith(`${option} `));
            if (key) {
                throw new InvalidAgentDefinitionError(`${VARIABLES[key]}${error.message.slice(key.length)}`);
            }
        }
        throw error;
    }
}
