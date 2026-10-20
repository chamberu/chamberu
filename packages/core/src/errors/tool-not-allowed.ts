/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ChamberuError } from './base.ts';
import { ErrorCode } from './constants.ts';

/**
 * A tool call the agent's toolPolicy refuses for the run: the tool step's
 * error for a model's call to it, and the tool error an approved call from an
 * older history gets. It does not fail the run.
 */
export class ToolNotAllowedError extends ChamberuError {
    constructor(toolName: string) {
        super({ message: `The tool "${toolName}" is not allowed for this run.`, code: ErrorCode.TOOL_NOT_ALLOWED });
    }
}
