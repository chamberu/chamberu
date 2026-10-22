/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { inject } from '@chamvi/core';
import type {
    IContextProvider,
    INotifier,
    StateSchema,
    ToolContext,
} from '@chamvi/core';
import { DEFAULT_NOTIFIER_NAME } from '../notifier/constants.ts';
import { openclawContextKey } from './helpers.ts';

/** Provides `notifier` under its name to every tool, tools factory and effect hook of the engine's runs. */
export function provideOpenclawContext(provider: IContextProvider, notifier: INotifier): void {
    provider.provide(openclawContextKey(notifier.name), notifier);
}

/**
 * The OpenClaw notifier named `name` (default `openclaw`) provided on the
 * engine; throws ContextNotProvidedError (naming `openclaw:<name>`) without one.
 */
export function injectOpenclawContext<S extends StateSchema = StateSchema>(
    ctx: ToolContext<S>,
    name: string = DEFAULT_NOTIFIER_NAME,
): INotifier {
    return inject(ctx, openclawContextKey(name));
}
