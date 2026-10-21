/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ChamviError, InvalidAgentDefinitionError } from '@chamvi/core';
import type { IContainer } from 'eldin';
import type { IModule } from 'orkos';
import { isObject } from 'smob';
import { APP_ERROR_CODE, AppToken } from '../module/constants.ts';
import { configModule } from '../modules/config/module.ts';
import { engineModule } from '../modules/engine/module.ts';
import { httpModule } from '../modules/http/module.ts';
import { schedulerModule } from '../modules/scheduler/module.ts';
import { staticTokensModule } from '../modules/static-tokens/module.ts';
import { storeModule } from '../modules/store/module.ts';
import type { AppOptions } from './types.ts';

function isModule(value: unknown): value is IModule {
    return isObject(value) &&
        typeof value.name === 'string' &&
        value.name.length > 0 &&
        typeof value.setup === 'function';
}

/**
 * The modules of an app: the built-ins in their order, each replaced in place
 * by a user module of the same name, then the other user modules in their
 * order. Throws InvalidAgentDefinitionError for a non-module or a name used
 * twice among `modules`.
 */
export function buildModules(modules: AppOptions['modules'] = []): IModule[] {
    if (!Array.isArray(modules)) {
        throw new InvalidAgentDefinitionError('modules must be an array of IModule instances.');
    }

    const byName = new Map<string, IModule>();
    modules.forEach((module: unknown, index) => {
        // orkos would import() a string, and config or store are real npm packages
        if (!isModule(module)) {
            throw new InvalidAgentDefinitionError(`modules[${index}] must be an IModule instance.`);
        }
        if (byName.has(module.name)) {
            throw new InvalidAgentDefinitionError(`Two modules are named "${module.name}".`);
        }
        byName.set(module.name, module);
    });

    const builtins = [
        configModule(),
        storeModule(),
        staticTokensModule(),
        engineModule(),
        schedulerModule(),
        httpModule(),
    ];
    const builtinNames = new Set(builtins.map((module) => module.name));

    return [
        ...builtins.map((module) => byName.get(module.name) ?? module),
        ...modules.filter((module) => !builtinNames.has(module.name)),
    ];
}

/** Logs a reported error through the app logger once registered, else to stderr. */
export function logReported(container: IContainer, error: unknown, context?: Record<string, unknown>): void {
    if (container.has(AppToken.LOGGER)) {
        container.resolve(AppToken.LOGGER).error('app error', error, context);
        return;
    }

    // eslint-disable-next-line no-console
    console.error('[chamvi]', error, ...(context ? [context] : []));
}

export function createInUseError(): ChamviError {
    return new ChamviError({
        code: APP_ERROR_CODE.IN_USE,
        message: 'An App runs once; create another for a second lifecycle.',
    });
}

export function createStopFailedError(errors: unknown[]): ChamviError {
    return new ChamviError({
        code: APP_ERROR_CODE.STOP_FAILED,
        message: `${errors.length} error(s) while stopping; see the log.`,
        cause: new AggregateError(errors),
    });
}
