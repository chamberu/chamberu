/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { TypedToken } from 'eldin';
import type { AppTokens } from './types.ts';

/** Something a module starts once every `onReady` checked its configuration (internal). */
type StartStep = {
    readonly name: string;
    /** Runs the step once; later calls return the first call's promise. */
    run(): Promise<void>;
};

function token<K extends keyof AppTokens>(key: K): TypedToken<AppTokens[K]> {
    return new TypedToken<AppTokens[K]>(`chamvi.${key.toLowerCase().replace(/_/g, '-')}`);
}

/**
 * The container keys modules share. `HTTP_ROUTES`, `AUTHENTICATORS`,
 * `NOTIFIERS` and `LIFECYCLE_HOOKS` are collections (`registerMany` in
 * `setup`, `resolveAll` in `onReady`); every other token holds one value.
 */
export const AppToken = {
    CONTEXT: token('CONTEXT'),
    CONFIG: token('CONFIG'),
    LOGGER: token('LOGGER'),
    CLOCK: token('CLOCK'),
    STORE: token('STORE'),
    DATA_SOURCE: token('DATA_SOURCE'),
    ENGINE: token('ENGINE'),
    SCHEDULER: token('SCHEDULER'),
    SHUTDOWN: token('SHUTDOWN'),
    SERVER: token('SERVER'),
    HTTP_ROUTES: token('HTTP_ROUTES'),
    AUTHENTICATORS: token('AUTHENTICATORS'),
    NOTIFIERS: token('NOTIFIERS'),
    LIFECYCLE_HOOKS: token('LIFECYCLE_HOOKS'),
} as const;

/**
 * The start steps (internal): what the engine and scheduler modules start
 * once every module validated its configuration in `onReady` (`runStartSteps`).
 */
export const START_STEPS = new TypedToken<StartStep>('chamvi.start-steps');

/** The built-in modules' names; list a module of the same name to replace one. */
export const ModuleName = {
    CONFIG: 'chamvi:config',
    STORE: 'chamvi:store',
    STATIC_TOKENS: 'chamvi:static-tokens',
    ENGINE: 'chamvi:engine',
    SCHEDULER: 'chamvi:scheduler',
    HTTP: 'chamvi:http',
} as const;

/** The order of the authenticator chain (lowest first). */
export const AUTHENTICATOR_ORDER = {
    STATIC_TOKENS: 0,
    AUTHUP: 10,
    OIDC: 20,
} as const;

export const APP_ERROR_CODE = {
    STOPPED: 'app_stopped',
    IN_USE: 'app_in_use',
    STOP_FAILED: 'app_stop_failed',
} as const;
