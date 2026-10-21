/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { RunWire } from '../api/types.ts';

export type AnswerResult = 'answered' | 'already-answered' | 'forbidden';

/** An answer given from the inbox: the run as it was answered, and how it went. */
export type DecidedApproval = {
    run: RunWire;
    result: AnswerResult;
    approved: boolean;
    reason?: string
};

/** The ids a resume token names, for display only: the server verifies the token. */
export type ResumeClaims = { runId: string; approvalId: string };
