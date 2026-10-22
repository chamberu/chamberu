/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { consoleNotifier } from '@chamvi/core';
import type { IContainer } from 'eldin';
import type { IModule } from 'orkos';
import { AppToken } from '../../module/constants.ts';
import type { ConsoleNotifierModuleOptions } from './types.ts';

/** Contributes `consoleNotifier(options)` to `AppToken.NOTIFIERS`. */
export class ConsoleNotifierModule implements IModule {
    readonly name: string;

    protected options: ConsoleNotifierModuleOptions;

    constructor(options: ConsoleNotifierModuleOptions = {}) {
        this.options = options;
        this.name = `chamvi:notifier:${options.name ?? 'console'}`;
    }

    async setup(container: IContainer): Promise<void> {
        container.registerMany(AppToken.NOTIFIERS, { useValue: consoleNotifier(this.options) });
    }
}

export function consoleNotifierModule(options?: ConsoleNotifierModuleOptions): IModule {
    return new ConsoleNotifierModule(options);
}
