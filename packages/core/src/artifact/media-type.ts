/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

// RFC 6838 restricted names, no parameters
const MEDIA_TYPE = /^[a-z0-9][\w!#$&^.+-]{0,126}\/[a-z0-9][\w!#$&^.+-]{0,126}$/i;

/**
 * True for a media type an artifact may carry: `type/subtype` (RFC 6838
 * restricted names, case-insensitive) without parameters.
 */
export function isArtifactMediaType(value: unknown): value is string {
    return typeof value === 'string' && MEDIA_TYPE.test(value);
}
