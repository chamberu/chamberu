/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export type AnswerResult = 'answered' | 'already-answered' | 'forbidden';

/** The ids a resume token names, for display only: the server verifies the token. */
export type ResumeClaims = { runId: string; approvalId: string };
