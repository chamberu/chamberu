/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ChamviError } from './base.ts';
import { ErrorCode } from './constants.ts';

export class InvalidResumeTokenError extends ChamviError {
    constructor(message = 'The resume token is invalid or expired.') {
        super({ message, code: ErrorCode.INVALID_RESUME_TOKEN });
    }
}
