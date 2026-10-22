/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** The prefix of openclaw()'s option errors. */
export const ERROR_PREFIX = 'openclaw: ';

/** The env variable each openclaw() option is read from (`deliver.*` from the deliver variables). */
export const VARIABLES = {
    'baseUrl': 'OPENCLAW_BASE_URL',
    'hooksToken': 'OPENCLAW_HOOKS_TOKEN',
    'hooksPath': 'OPENCLAW_HOOKS_PATH',
    'agentId': 'OPENCLAW_AGENT_ID',
    'deliver.channel': 'OPENCLAW_CHANNEL',
    'deliver.to': 'OPENCLAW_TO',
    'deliver.accountId': 'OPENCLAW_ACCOUNT_ID',
} as const;
