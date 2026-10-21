/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

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

function readDelivery(env: Env): OpenclawDelivery {
    const accountId = envString(env, 'OPENCLAW_ACCOUNT_ID');
    return {
        channel: envString(env, 'OPENCLAW_CHANNEL', { required: true }),
        to: envString(env, 'OPENCLAW_TO', { required: true }),
        ...(typeof accountId === 'string' && { accountId }),
    };
}

/** Contributes `openclaw()` to `AppToken.NOTIFIERS`, options resolved when the factory is called. */
export class OpenclawModule implements IModule {
    readonly name: string;

    readonly dependencies = [ModuleName.CONFIG];

    protected options: Omit<OpenclawNotifierOptions, 'clock'> & Pick<Partial<OpenclawNotifierOptions>, 'clock'>;

    constructor(input: OpenclawModuleOptions = {}) {
        const { env: given, ...options } = input;
        const env = given ?? process.env;
        const hooksPath = options.hooksPath ?? envString(env, 'OPENCLAW_HOOKS_PATH');
        const agentId = options.agentId ?? envString(env, 'OPENCLAW_AGENT_ID');

        this.options = {
            ...options,
            baseUrl: options.baseUrl ?? envUrl(env, 'OPENCLAW_BASE_URL', { required: true, protocols: ['http:', 'https:'] }),
            hooksToken: options.hooksToken ?? envString(env, 'OPENCLAW_HOOKS_TOKEN', { required: true }),
            deliver: options.deliver ?? readDelivery(env),
            ...(typeof hooksPath === 'string' && { hooksPath }),
            ...(typeof agentId === 'string' && { agentId }),
        };
        this.name = `chamvi:notifier:${options.name ?? DEFAULT_NAME}`;
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
