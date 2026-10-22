/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ChamviError } from './base.ts';
import { ErrorCode } from './constants.ts';

export class AgentNotFoundError extends ChamviError {
    constructor(name: string) {
        super({ message: `unknown agent: ${name}`, code: ErrorCode.AGENT_NOT_FOUND });
    }
}
