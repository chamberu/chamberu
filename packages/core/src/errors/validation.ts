/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Issue } from '@ebec/core';
import { ChamviError } from './base.ts';
import { ErrorCode } from './constants.ts';

/**
 * A value failed its Standard Schema validation (e.g. a state document on
 * upsert). `issues` holds the validup issues, with paths flattened to keys.
 * `code` is `validation_error` unless a narrower one applies (a request body
 * above its limit is `payload_too_large`).
 */
export class ValidationError extends ChamviError {
    constructor(message: string, issues: readonly Issue[] = [], code: ErrorCode = ErrorCode.VALIDATION) {
        super({
            message,
            code,
            issues,
        });
    }
}
