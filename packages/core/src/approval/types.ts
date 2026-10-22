/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Invoker } from '../trigger/types.ts';

export type ResumeTokenClaims = {
    runId: string;
    approvalId: string;
    tokenId: string;
};

export type ResumeTokenPayload = ResumeTokenClaims & {
    /** expiresAt in epoch milliseconds. */
    exp: number;
};

/** What a tool asks the owner to approve (`approve()`, `ChannelHandle.approve()`). */
export type ApprovalRequestInput = {
    title: string;
    body?: string;
    /** How long the approval waits before it is denied; default 24 h. */
    timeoutMs?: number;
};

/** The owner's answer to an approval request. */
export type ApprovalDecision = {
    approved: boolean;
    reason?: string;
    /** Who answered, when known. */
    approver?: Invoker;
};
