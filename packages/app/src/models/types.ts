/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Agent } from '@chamvi/core';
import type { createProviderRegistry } from 'ai';
import type { Env } from '../env/types.ts';

/** createApp's `models`: providers by id, as `createProviderRegistry()` takes them. */
export type ModelProviders = Parameters<typeof createProviderRegistry>[0];

/** A provider package `createModelRegistry()` discovers when it is installed. */
export type BuiltinProvider = {
    /** The registry id, the part of a model string before `:`. */
    id: string;
    /** The npm package. */
    package: string;
    /** The factory the package exports. */
    factory: string;
    /** The env variable holding the API key. */
    apiKey: string;
    /** The env variable holding a base URL, when the provider reads one. */
    baseUrl?: string;
};

export type ModelRegistryOptions = {
    agents: readonly Agent[];
    env: Env;
    models?: ModelProviders;
    /** Loads a provider package; default `(s) => import(s)`. */
    importer?: (specifier: string) => Promise<unknown>;
};
