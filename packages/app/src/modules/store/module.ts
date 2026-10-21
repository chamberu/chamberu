/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { MemoryStore } from '@chamvi/core';
import type { IStore } from '@chamvi/core';
import type { IContainer } from 'eldin';
import type { IModule } from 'orkos';
import { AppToken, ModuleName } from '../../module/constants.ts';
import { MEMORY_STORE_WARNING, PURGE_HOOK_NAME } from './constants.ts';
import { createPurgeTimer } from './purge.ts';
import type {
    IPurgeTimer,
    PurgingStore,
    StoreModuleOptions,
} from './types.ts';

function isPurgingStore(store: IStore): store is IStore & PurgingStore {
    return typeof (store as Partial<PurgingStore>).purgeExpired === 'function';
}

/**
 * Registers `AppToken.STORE`: the given store, else a MemoryStore without a
 * database URL. A store with `purgeExpired` gets the purge timer in start mode.
 */
export class StoreModule implements IModule {
    readonly name: string = ModuleName.STORE;

    readonly dependencies = [ModuleName.CONFIG];

    protected options: StoreModuleOptions;

    protected purge: IPurgeTimer | undefined;

    constructor(options: StoreModuleOptions = {}) {
        this.options = options;
    }

    async setup(container: IContainer): Promise<void> {
        const context = container.resolve(AppToken.CONTEXT);
        const config = container.resolve(AppToken.CONFIG);
        const clock = container.resolve(AppToken.CLOCK);
        const logger = container.resolve(AppToken.LOGGER);

        let store: IStore;
        if (this.options.store) {
            ({ store } = this.options);
        } else {
            store = new MemoryStore({ clock });
            if (!config.dev) {
                logger.warn(MEMORY_STORE_WARNING);
            }
        }

        container.register(AppToken.STORE, { useValue: store });

        if (context.mode === 'start' && config.store.purgeIntervalMs > 0 && isPurgingStore(store)) {
            const purge = createPurgeTimer({
                store,
                clock,
                intervalMs: config.store.purgeIntervalMs,
                logger,
            });
            this.purge = purge;
            container.registerMany(AppToken.LIFECYCLE_HOOKS, {
                useValue: {
                    name: PURGE_HOOK_NAME,
                    started: () => purge.start(),
                    stopping: () => purge.stop(),
                },
            });
        }
    }

    async teardown(): Promise<void> {
        this.purge?.stop();
        this.purge = undefined;
    }
}

export function storeModule(options?: StoreModuleOptions): IModule {
    return new StoreModule(options);
}
