/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ChamberuError } from './base.ts';
import { ErrorCode } from './constants.ts';

export class RunNotFoundError extends ChamberuError {
    constructor(runId: string) {
        super({ message: `Run "${runId}" was not found.`, code: ErrorCode.RUN_NOT_FOUND });
    }
}
