/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export type Env = Record<string, string | undefined>;

export type EnvReadOptions<T> = {
    /** Used when the variable is unset or empty. */
    default?: T;
    /** Throws when the variable is unset or empty and no default is given. */
    required?: boolean;
};

/** Options that make a reader return a defined value. */
export type EnvDefinedOptions<T> = { required: true } | { default: T };

export type EnvStringOptions = EnvReadOptions<string> & { minLength?: number };

export type EnvIntegerOptions = EnvReadOptions<number> & { min?: number; max?: number };

export type EnvUrlOptions = EnvReadOptions<string> & { protocols?: readonly string[] };

export type EnvJsonOptions = { required?: boolean };
