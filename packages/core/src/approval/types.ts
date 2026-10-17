/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export type ResumeTokenClaims = {
    runId: string;
    approvalId: string;
    tokenId: string;
};

export type ResumeTokenPayload = ResumeTokenClaims & {
    /** expiresAt in epoch milliseconds. */
    exp: number;
};
