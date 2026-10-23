/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { AppToken, ModuleName, approvalUrlOf } from '@chamvi/app';
import type { IContainer, IModule } from '@chamvi/app';
import type { IGithubApp } from '../app/types.ts';
import { githubChannel } from '../channel/module.ts';
import { provideGithubContext } from '../context/module.ts';
import { GITHUB_MODULE_NAME } from './constants.ts';
import { createGithubAppFromEnv } from './helpers.ts';
import type { GithubModuleChannelOptions, GithubModuleOptions } from './types.ts';

/**
 * A GitHub App (`.app`, built when the factory is called) whose `setup`
 * contributes its channel (`githubChannel()`, deliveries in at
 * `/channels/<name>`, comments out) to `AppToken.CHANNELS`, with the UI
 * approval link from `CHAMVI_PUBLIC_URL` unless `channel.approvalUrl` is
 * given, the app's clock and, unless `channel.onError` is given, the app's
 * logger for the failures of a delivery, and provides the app on the engine
 * (`injectGithubContext(ctx)`).
 */
export class GithubModule implements IModule {
    readonly name: string = GITHUB_MODULE_NAME;

    readonly dependencies = [ModuleName.CONFIG];

    readonly app: IGithubApp;

    protected channelOptions: GithubModuleChannelOptions;

    constructor(options: GithubModuleOptions = {}) {
        const {
            app,
            env,
            channel,
            ...appOptions
        } = options;
        this.channelOptions = channel ?? {};
        this.app = app ?? createGithubAppFromEnv(env ?? process.env, appOptions);
    }

    async setup(container: IContainer): Promise<void> {
        const config = container.resolve(AppToken.CONFIG);
        const approvalUrl = this.channelOptions.approvalUrl ?? approvalUrlOf(config);
        const logger = container.resolve(AppToken.LOGGER);
        const channel = githubChannel({
            ...this.channelOptions,
            app: this.app,
            ...(approvalUrl && { approvalUrl }),
            clock: container.resolve(AppToken.CLOCK),
            // a failed agent of a delivery (filter, key, dispatch) belongs in the app's log
            onError: this.channelOptions.onError ?? ((error) => logger.error('github channel error', error)),
        });
        container.registerMany(AppToken.CHANNELS, { useValue: channel });
        container.registerMany(AppToken.LIFECYCLE_HOOKS, {
            useValue: {
                name: this.name,
                engineCreated: (engine) => provideGithubContext(engine, this.app),
            },
        });
    }
}

/**
 * The GitHub App module. Reads `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`,
 * `GITHUB_WEBHOOK_SECRET` (comma-separated), `GITHUB_INSTALLATION_ID`,
 * `GITHUB_APP_SLUG` and `GITHUB_API_URL` from `options.env ?? process.env`
 * now, unless `options.app` is given; explicit options win.
 */
export function githubModule(options?: GithubModuleOptions): GithubModule {
    return new GithubModule(options);
}
