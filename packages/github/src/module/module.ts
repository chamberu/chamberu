/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { AppToken } from '@chamvi/app';
import type { IContainer, IModule } from '@chamvi/app';
import type { IGithubApp } from '../app/types.ts';
import { provideGithubContext } from '../context/module.ts';
import { GITHUB_MODULE_NAME } from './constants.ts';
import { createGithubAppFromEnv } from './helpers.ts';
import type { GithubModuleOptions } from './types.ts';

/**
 * A GitHub App (`.app`, built when the factory is called) whose `setup`
 * contributes its signed webhook route to `AppToken.HTTP_ROUTES` and provides
 * the app on the engine (`injectGithubContext(ctx)`).
 */
export class GithubModule implements IModule {
    readonly name: string = GITHUB_MODULE_NAME;

    readonly app: IGithubApp;

    protected webhookPath: string | undefined;

    constructor(options: GithubModuleOptions = {}) {
        const {
            app,
            env,
            webhookPath,
            ...appOptions
        } = options;
        this.webhookPath = webhookPath;
        this.app = app ?? createGithubAppFromEnv(env ?? process.env, appOptions);
    }

    async setup(container: IContainer): Promise<void> {
        container.registerMany(AppToken.HTTP_ROUTES, { useValue: this.app.webhookRoute(typeof this.webhookPath === 'string' ? { path: this.webhookPath } : undefined) });
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
