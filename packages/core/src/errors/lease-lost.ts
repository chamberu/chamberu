/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ChamberuError } from './base.ts';
import { ErrorCode } from './constants.ts';

/**
 * Reported to onError when this engine stops executing a run because its
 * claim was lost (renewal refused, or another owner took the run over). The
 * run is not failed: its current owner, or recovery after the claim expired,
 * carries it on.
 */
export class LeaseLostError extends ChamberuError {
    readonly runId: string;

    constructor(runId: string) {
        super({ message: `Lost the claim of run "${runId}"; it is no longer executed here.`, code: ErrorCode.LEASE_LOST });
        this.runId = runId;
    }
}
