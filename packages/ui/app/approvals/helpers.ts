/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ApiError } from '../api/error.ts';
import type { RunWire } from '../api/types.ts';
import { hasPermission } from '../auth/helpers.ts';
import { shortId } from '../runs/helpers.ts';
import type {
    ApprovalLink,
    DecidedApproval,
    LinkNotice,
    LinkedApprovalState,
    NotifiedLine,
} from './types.ts';

/** The first non-empty string of a query value (a repeated key is an array). */
function firstToken(value: unknown): string | undefined {
    const values: unknown[] = Array.isArray(value) ? value : [value];
    return values.find((item): item is string => typeof item === 'string' && item.length > 0);
}

/**
 * The inbox's open approvals: every waiting run but the linked one
 * (`linkRunId`) and those whose current approval was answered here. The
 * match is on run and approval id, so a run that pauses on its next
 * approval shows up again.
 */
export function pendingApprovals(
    runs: readonly RunWire[],
    decided: readonly DecidedApproval[],
    linkRunId?: string,
): RunWire[] {
    return runs.filter((run) => run.id !== linkRunId && decided.every((d) => !(
        d.result === 'answered' &&
        d.run.id === run.id &&
        d.run.waiting?.approvalId === run.waiting?.approvalId
    )));
}

/**
 * The callout's "notified" line: the channel (and address) the approval went
 * out through once sent, `inbox only` for a request that names no channel,
 * else "not sent (retrying)" (the engine re-sends on every poll).
 */
export function notifiedLine(run: RunWire): NotifiedLine {
    const { waiting } = run;
    if (!waiting?.channel) return { text: 'inbox only', warn: false };
    if (waiting.notifiedAt) {
        return { text: waiting.address ? `${waiting.channel} · ${waiting.address}` : waiting.channel, warn: false };
    }
    return { text: 'not sent (retrying)', warn: true };
}

/**
 * The token-less approval link of a query (`?run=<runId>&approval=<approvalId>`,
 * a repeated key's first non-empty value): `undefined` without a run, the
 * approval optional (the run's current one).
 */
export function readApprovalLink(query: Record<string, unknown>): ApprovalLink | undefined {
    const runId = firstToken(query.run);
    if (!runId) return undefined;
    const approvalId = firstToken(query.approval);
    return approvalId ? { runId, approvalId } : { runId };
}

/** The query of a run's approval link, for in-app links to the inbox. */
export function approvalLinkQuery(run: RunWire): Record<string, string> {
    return run.waiting ? { run: run.id, approval: run.waiting.approvalId } : { run: run.id };
}

/**
 * Where a linked approval stands: answered from this page (an `answered`
 * result for that run and approval), pending (the run waits on it, not
 * expired, the principal holds `agent:<agent>:approve`), forbidden (the
 * same without the grant) or moved on (not waiting, another approval, or
 * expired). Without a run yet: 404 is `not-found`, 403 `unreadable`, any
 * other error `failed`, else `loading`; a run loaded earlier wins over a
 * later failed reload. Without `link.approvalId` the run's current
 * approval is the linked one.
 */
export function linkedApprovalState(input: {
    link: ApprovalLink;
    run: RunWire | undefined;
    error: ApiError | undefined;
    decided: readonly DecidedApproval[];
    permissions: readonly string[];
    now: number;
}): LinkedApprovalState {
    const {
        link, 
        run, 
        error, 
    } = input;
    if (!run) {
        if (error?.status === 404) return { kind: 'not-found' };
        if (error?.status === 403) return { kind: 'unreadable' };
        if (error) return { kind: 'failed', message: error.message };
        return { kind: 'loading' };
    }
    const approvalId = link.approvalId ?? run.waiting?.approvalId;
    const answered = input.decided.some((d) => d.result === 'answered' &&
        d.run.id === run.id &&
        d.run.waiting?.approvalId === approvalId);
    if (answered) return { kind: 'answered', run };
    if (!run.waiting) {return {
        kind: 'moved-on', 
        reason: 'not-waiting', 
        run, 
    };}
    if (run.waiting.approvalId !== approvalId) {return {
        kind: 'moved-on', 
        reason: 'other-approval', 
        run, 
    };}
    if (Date.parse(run.waiting.expiresAt) <= input.now) {return {
        kind: 'moved-on', 
        reason: 'expired', 
        run, 
    };}
    if (!hasPermission(input.permissions, `agent:${run.agent}:approve`)) return { kind: 'forbidden', run };
    return { kind: 'pending', run };
}

/** The notice for a linked approval this page cannot answer; `undefined` while loading, pending or answered. */
export function linkNotice(state: LinkedApprovalState, link: ApprovalLink): LinkNotice | undefined {
    switch (state.kind) {
        case 'forbidden':
            return {
                status: 403,
                text: `Answering this approval needs agent:${state.run.agent}:approve, which you do not hold.`,
                runId: state.run.id,
            };
        case 'unreadable':
            return { status: 403, text: `Run ${shortId(link.runId)} is not readable with your grants (run:read or agent:<agent>:run).` };
        case 'not-found':
            return { text: `Run ${shortId(link.runId)} was not found.` };
        case 'failed':
            return { text: `Run ${shortId(link.runId)} could not be loaded: ${state.message}` };
        case 'moved-on': {
            const texts = {
                'not-waiting': `This run no longer waits on this approval: it is ${state.run.status} now.`,
                'other-approval': `This run now waits on another approval (${state.run.waiting?.toolName}); it is listed below.`,
                expired: 'This approval expired; the engine denies it on its next poll.',
            } as const;
            return { text: texts[state.reason], runId: state.run.id };
        }
        default:
            return undefined;
    }
}
