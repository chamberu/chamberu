/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** A non-empty string without NUL. */
export function isName(value: unknown): boolean {
    return typeof value === 'string' && value.length > 0 && !value.includes('\0');
}
