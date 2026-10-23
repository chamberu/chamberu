/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isObject } from 'smob';
import type { Invoker } from '../trigger/types.ts';
import type { ApprovalDecision } from './types.ts';

/** The effect store key the decision of `approvalId` is recorded under. */
export function approvalDecisionKey(runId: string, approvalId: string): string {
    return `approval:${runId}:${approvalId}`;
}

/** A recorded decision as approve() returns it (no undefined fields). */
export function toApprovalDecision(value: unknown): ApprovalDecision {
    const record = isObject(value) ? value : {};
    return {
        approved: record.approved === true,
        ...(typeof record.reason === 'string' ? { reason: record.reason } : {}),
        ...(isObject(record.approver) ? { approver: record.approver as Invoker } : {}),
    };
}
