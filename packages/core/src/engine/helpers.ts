/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidResumeTokenError } from '../errors/index.ts';

/** The error of a token-based answer whose run moved on to another approval. */
export function staleToken(): Error {
    return new InvalidResumeTokenError('The resume token does not belong to the current approval.');
}
