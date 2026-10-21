/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ISandboxProvider } from '@chamvi/sandbox';

export type LazyProvider = ISandboxProvider & {
    /** Loads the provider once (concurrent callers share it); a failure is not cached. */
    load(): Promise<void>;
};

/**
 * A provider that loads the real one on first use, so an app imports only
 * the provider package it runs with (internal).
 */
export function createLazyProvider(name: string, load: () => Promise<ISandboxProvider>): LazyProvider {
    let loading: Promise<ISandboxProvider> | undefined;
    const target = (): Promise<ISandboxProvider> => {
        loading ??= load().catch((error: unknown) => {
            loading = undefined;
            throw error;
        });
        return loading;
    };

    return {
        name,
        async load() {
            await target();
        },
        async create(options) {
            return (await target()).create(options);
        },
        async collectGarbage() {
            return (await target()).collectGarbage();
        },
    };
}
