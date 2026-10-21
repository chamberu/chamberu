/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { githubNotifier } from '@chamvi/notify-github';
import type { IContainer } from 'eldin';
import type { IModule } from 'orkos';
import { approvalUrlOf } from '../config/helpers.ts';
import { AppToken, ModuleName } from '../module/constants.ts';
import { DEFAULT_GITHUB_NOTIFIER_NAME } from './constants.ts';
import type { GithubNotifierModuleOptions } from './types.ts';

/**
 * Contributes `githubNotifier()` to `AppToken.NOTIFIERS`, with the UI approval
 * link from `CHAMVI_PUBLIC_URL` unless `approvalUrl` is given, on the app's clock.
 */
export class GithubNotifierModule implements IModule {
    readonly name: string;

    readonly dependencies = [ModuleName.CONFIG];

    protected options: GithubNotifierModuleOptions;

    constructor(options: GithubNotifierModuleOptions) {
        this.options = options;
        this.name = `chamvi:notifier:${options.name ?? DEFAULT_GITHUB_NOTIFIER_NAME}`;
    }

    async setup(container: IContainer): Promise<void> {
        const config = container.resolve(AppToken.CONFIG);
        const approvalUrl = this.options.approvalUrl ?? approvalUrlOf(config);
        container.registerMany(AppToken.NOTIFIERS, {
            useValue: githubNotifier({
                ...this.options,
                ...(approvalUrl && { approvalUrl }),
                clock: container.resolve(AppToken.CLOCK),
            }),
        });
    }
}

export function githubNotifierModule(options: GithubNotifierModuleOptions): IModule {
    return new GithubNotifierModule(options);
}
