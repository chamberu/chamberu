/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ChamberuError } from './base.ts';
import { ErrorCode } from './constants.ts';

/**
 * The model gave no complete answer: its stream ended without a finish part,
 * or (with structured output) the answer was cut off or the loop ended on a
 * tool call nothing executed. Fails the run.
 */
export class IncompleteResponseError extends ChamberuError {
    constructor(message: string) {
        super({ message, code: ErrorCode.INCOMPLETE_RESPONSE });
    }
}
