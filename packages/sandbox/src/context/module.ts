/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { inject } from '@chamvi/core';
import type { IContextProvider, StateSchema, ToolContext } from '@chamvi/core';
import type { IWorkspaceManager } from '../manager/types.ts';
import { SANDBOX_CONTEXT } from './constants.ts';

/** Provides `manager` to every tool, tools factory and effect hook of the engine's runs. */
export function provideSandboxContext(provider: IContextProvider, manager: IWorkspaceManager): void {
    provider.provide(SANDBOX_CONTEXT, manager);
}

/** The workspace manager provided on the engine; throws ContextNotProvidedError (naming `sandbox`) without one. */
export function injectSandboxContext<S extends StateSchema = StateSchema>(ctx: ToolContext<S>): IWorkspaceManager {
    return inject(ctx, SANDBOX_CONTEXT);
}
