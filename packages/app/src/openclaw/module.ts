/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError } from '@chamvi/core';
import { openclaw } from '@chamvi/notify-openclaw';
import type { OpenclawDelivery, OpenclawNotifierOptions } from '@chamvi/notify-openclaw';
import type { IContainer } from 'eldin';
import type { IModule } from 'orkos';
import { approvalUrlOf } from '../config/helpers.ts';
import { envString, envUrl } from '../env/module.ts';
import type { Env } from '../env/types.ts';
import { AppToken, ModuleName } from '../module/constants.ts';
import type { OpenclawModuleOptions } from './types.ts';

const DEFAULT_NAME = 'openclaw';

/** The prefix of openclaw()'s option errors. */
const ERROR_PREFIX = 'openclaw: ';

/** The env variable each openclaw() option is read from (`deliver.*` from the deliver variables). */
const VARIABLES = {
    'baseUrl': 'OPENCLAW_BASE_URL',
    'hooksToken': 'OPENCLAW_HOOKS_TOKEN',
    'hooksPath': 'OPENCLAW_HOOKS_PATH',
    'agentId': 'OPENCLAW_AGENT_ID',
    'deliver.channel': 'OPENCLAW_CHANNEL',
    'deliver.to': 'OPENCLAW_TO',
    'deliver.accountId': 'OPENCLAW_ACCOUNT_ID',
} as const;

type EnvOption = keyof typeof VARIABLES;

function readDelivery(env: Env): OpenclawDelivery {
    const accountId = envString(env, VARIABLES['deliver.accountId']);
    return {
        channel: envString(env, VARIABLES['deliver.channel'], { required: true }),
        to: envString(env, VARIABLES['deliver.to'], { required: true }),
        ...(typeof accountId === 'string' && { accountId }),
    };
}

/** Contributes `openclaw()` to `AppToken.NOTIFIERS`, options resolved and checked when the factory is called. */
export class OpenclawModule implements IModule {
    readonly name: string;

    readonly dependencies = [ModuleName.CONFIG];

    protected options: Omit<OpenclawNotifierOptions, 'clock'> & Pick<Partial<OpenclawNotifierOptions>, 'clock'>;

    constructor(input: OpenclawModuleOptions = {}) {
        const { env: given, ...options } = input;
        const env = given ?? process.env;
        const fromEnv = new Set<EnvOption>();
        const read = <T>(key: EnvOption, given: T | undefined, reader: () => T): T => {
            if (typeof given !== 'undefined') {
                return given;
            }
            fromEnv.add(key);
            return reader();
        };

        const hooksPath = read('hooksPath', options.hooksPath, () => envString(env, VARIABLES.hooksPath));
        const agentId = read('agentId', options.agentId, () => envString(env, VARIABLES.agentId));
        if (typeof options.deliver === 'undefined') {
            fromEnv.add('deliver.channel').add('deliver.to').add('deliver.accountId');
        }

        this.options = {
            ...options,
            baseUrl: read('baseUrl', options.baseUrl, () => envUrl(env, VARIABLES.baseUrl, { required: true, protocols: ['http:', 'https:'] })),
            hooksToken: read('hooksToken', options.hooksToken, () => envString(env, VARIABLES.hooksToken, { required: true })),
            deliver: options.deliver ?? readDelivery(env),
            ...(typeof hooksPath === 'string' && { hooksPath }),
            ...(typeof agentId === 'string' && { agentId }),
        };
        this.name = `chamvi:notifier:${options.name ?? DEFAULT_NAME}`;
        this.check(fromEnv);
    }

    /**
     * Runs openclaw()'s option checks now, so a malformed value fails when the
     * factory is called; an error about a value read from env names the variable.
     */
    protected check(fromEnv: ReadonlySet<EnvOption>): void {
        try {
            openclaw(this.options);
        } catch (error) {
            if (error instanceof InvalidAgentDefinitionError && error.message.startsWith(ERROR_PREFIX)) {
                const rule = error.message.slice(ERROR_PREFIX.length);
                const key = [...fromEnv].find((option) => rule.startsWith(`${option} `));
                if (key) {
                    throw new InvalidAgentDefinitionError(`${VARIABLES[key]}${rule.slice(key.length)}`);
                }
            }
            throw error;
        }
    }

    async setup(container: IContainer): Promise<void> {
        const approvalUrl = this.options.approvalUrl ?? approvalUrlOf(container.resolve(AppToken.CONFIG));
        container.registerMany(AppToken.NOTIFIERS, {
            useValue: openclaw({
                ...this.options,
                ...(approvalUrl && { approvalUrl }),
                clock: this.options.clock ?? container.resolve(AppToken.CLOCK),
            }),
        });
    }
}

/**
 * The OpenClaw notifier module. Reads `OPENCLAW_BASE_URL`,
 * `OPENCLAW_HOOKS_TOKEN`, `OPENCLAW_CHANNEL`, `OPENCLAW_TO` (required),
 * `OPENCLAW_HOOKS_PATH`, `OPENCLAW_AGENT_ID` and `OPENCLAW_ACCOUNT_ID` from
 * `options.env ?? process.env` now; options win.
 */
export function openclawModule(options?: OpenclawModuleOptions): IModule {
    return new OpenclawModule(options);
}
