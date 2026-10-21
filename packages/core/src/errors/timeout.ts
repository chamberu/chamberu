/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ChamviError } from './base.ts';
import { ErrorCode } from './constants.ts';

/** The abort reason when a run exceeds its `timeoutMs` budget. */
export class TimeoutError extends ChamviError {
    constructor(ms: number) {
        super({ message: `The run exceeded its ${ms}ms timeout.`, code: ErrorCode.TIMEOUT });
    }
}
