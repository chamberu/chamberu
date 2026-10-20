/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ValidationError } from '@chamberu/core';

/** `argv` is a non-empty list of strings without NUL, the first one non-empty. */
export function assertArgv(argv: readonly string[]): void {
    if (
        !Array.isArray(argv) ||
        argv.length === 0 ||
        argv[0] === '' ||
        argv.some((arg) => !(typeof arg === 'string' && !arg.includes('\0')))
    ) {
        throw new ValidationError('argv must be a non-empty list of strings without NUL, starting with the command.');
    }
}
