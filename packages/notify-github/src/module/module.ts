/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { AppToken, ModuleName, approvalUrlOf } from '@chamvi/app';
import type { IContainer, IModule } from '@chamvi/app';
import { provideGithubNotifierContext } from '../context/module.ts';
import { DEFAULT_NOTIFIER_NAME } from '../notifier/constants.ts';
import { githubNotifier } from '../notifier/module.ts';
import type { GithubNotifierModuleOptions } from './types.ts';

/**
 * Contributes `githubNotifier()` to `AppToken.NOTIFIERS`, with the UI approval
 * link from `CHAMVI_PUBLIC_URL` unless `approvalUrl` is given, on the app's clock,
 * and provides it on the engine (`injectGithubNotifierContext(ctx, name)`).
 */
export class GithubNotifierModule implements IModule {
    readonly name: string;

    readonly dependencies = [ModuleName.CONFIG];

    protected options: GithubNotifierModuleOptions;

    constructor(options: GithubNotifierModuleOptions) {
        this.options = options;
        this.name = `chamvi:notifier:${options.name ?? DEFAULT_NOTIFIER_NAME}`;
    }

    async setup(container: IContainer): Promise<void> {
        const config = container.resolve(AppToken.CONFIG);
        const approvalUrl = this.options.approvalUrl ?? approvalUrlOf(config);
        const notifier = githubNotifier({
            ...this.options,
            ...(approvalUrl && { approvalUrl }),
            clock: container.resolve(AppToken.CLOCK),
        });
        container.registerMany(AppToken.NOTIFIERS, { useValue: notifier });
        container.registerMany(AppToken.LIFECYCLE_HOOKS, {
            useValue: {
                name: this.name,
                engineCreated: (engine) => provideGithubNotifierContext(engine, notifier),
            },
        });
    }
}

export function githubNotifierModule(options: GithubNotifierModuleOptions): IModule {
    return new GithubNotifierModule(options);
}
