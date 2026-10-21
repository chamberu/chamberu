/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createScheduler } from '@chamvi/scheduler';
import type { IScheduler } from '@chamvi/scheduler';
import type { IContainer } from 'eldin';
import type { IModule } from 'orkos';
import { AppToken, ModuleName } from '../../module/constants.ts';
import { throwIfStopped } from '../../module/helpers.ts';
import type { SchedulerModuleOptions } from './types.ts';

/**
 * Fires the agents' cron triggers in-process: start mode with
 * `CHAMVI_SCHEDULER` on only. `onReady` builds and starts the scheduler and
 * registers `SCHEDULER`; `teardown` stops it (idempotent after the shutdown).
 */
export class SchedulerModule implements IModule {
    readonly name: string = ModuleName.SCHEDULER;

    readonly dependencies = [ModuleName.ENGINE];

    protected options: SchedulerModuleOptions;

    protected scheduler: IScheduler | undefined;

    constructor(options: SchedulerModuleOptions = {}) {
        this.options = options;
    }

    async setup(): Promise<void> {
        // everything happens in onReady, once the engine exists
    }

    async onReady(container: IContainer): Promise<void> {
        const context = container.resolve(AppToken.CONTEXT);
        if (context.mode !== 'start' || !container.resolve(AppToken.CONFIG).scheduler.enabled) {
            return;
        }

        const logger = container.resolve(AppToken.LOGGER);
        const scheduler = createScheduler({
            engine: container.resolve(AppToken.ENGINE),
            ...this.options,
            onError: (error, ctx) => logger.error('schedule error', error, ctx),
        });
        this.scheduler = scheduler;
        container.register(AppToken.SCHEDULER, { useValue: scheduler });

        throwIfStopped(context);
        await scheduler.start();
    }

    async teardown(): Promise<void> {
        const { scheduler } = this;
        this.scheduler = undefined;
        await scheduler?.stop();
    }
}

export function schedulerModule(options?: SchedulerModuleOptions): IModule {
    return new SchedulerModule(options);
}
