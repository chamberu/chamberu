/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { IssueCode } from '@ebec/core';
import { createValidupError, defineValidator } from 'validup';
import type { ValidatorDescriptor } from 'validup';

/** A string of `min` to `max` characters. */
export function isString({ min = 0, max }: { min?: number; max: number }): ValidatorDescriptor {
    return defineValidator({
        run: ({ value }) => {
            if (typeof value !== 'string' || value.length < min || value.length > max) {
                throw createValidupError(value, IssueCode.VALUE_INVALID, `must be a string of ${min} to ${max} characters`);
            }
            return value;
        },
    });
}

export function isBoolean(): ValidatorDescriptor {
    return defineValidator({
        run: ({ value }) => {
            if (typeof value !== 'boolean') throw createValidupError(value, IssueCode.VALUE_INVALID, 'must be a boolean');
            return value;
        },
    });
}

/** Any value except `undefined` (`null` is allowed). */
export function isDefined(): ValidatorDescriptor {
    return defineValidator({
        run: ({ value }) => {
            if (value === undefined) throw createValidupError(value, IssueCode.REQUIRED, 'is required');
            return value;
        },
    });
}
