/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { IssueCode } from '@ebec/core';
import { createValidupError, defineValidator } from 'validup';
import type { ValidatorDescriptor } from 'validup';

/** A string of `min` to `max` characters without U+0000 (which Postgres text columns refuse). */
export function isString({ min = 0, max }: { min?: number; max: number }): ValidatorDescriptor {
    return defineValidator({
        run: ({ value }) => {
            if (typeof value !== 'string' || value.length < min || value.length > max) {
                throw createValidupError(value, IssueCode.VALUE_INVALID, `must be a string of ${min} to ${max} characters`);
            }
            if (value.includes('\u0000')) {
                throw createValidupError(value, IssueCode.VALUE_INVALID, 'must not contain a NUL character');
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

/** An array of at most `max` items (the items are checked by their own mounts). */
export function isArray({ max }: { max: number }): ValidatorDescriptor {
    return defineValidator({
        run: ({ value }) => {
            if (!Array.isArray(value) || value.length > max) {
                throw createValidupError(value, IssueCode.VALUE_INVALID, `must be an array of at most ${max} items`);
            }
            return value;
        },
    });
}

// RFC 6838 restricted names, no parameters (the rule core applies to artifacts)
const MEDIA_TYPE = /^[a-z0-9][\w!#$&^.+-]{0,126}\/[a-z0-9][\w!#$&^.+-]{0,126}$/i;

/** A media type `type/subtype` without parameters. */
export function isMediaType(): ValidatorDescriptor {
    return defineValidator({
        run: ({ value }) => {
            if (typeof value !== 'string' || !MEDIA_TYPE.test(value)) {
                throw createValidupError(value, IssueCode.VALUE_INVALID, 'must be a media type of the form type/subtype');
            }
            return value;
        },
    });
}

const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/**
 * Strict base64 (RFC 4648 section 4: padded, no whitespace, no url-safe
 * alphabet, zero pad bits), decoded to a plain `Uint8Array`.
 */
export function isBase64(): ValidatorDescriptor {
    return defineValidator({
        run: ({ value }) => {
            if (typeof value === 'string' && BASE64.test(value)) {
                const buffer = Buffer.from(value, 'base64');
                // non-zero pad bits decode too: only the canonical form re-encodes to the input
                if (buffer.toString('base64') === value) return new Uint8Array(buffer);
            }
            // never echo the (up to bodyLimit) input back in the issue
            throw createValidupError(undefined, IssueCode.VALUE_INVALID, 'must be strict base64');
        },
    });
}
