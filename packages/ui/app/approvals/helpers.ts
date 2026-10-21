/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isObject } from 'smob';
import type { LocationQueryRaw } from 'vue-router';
import { RESUME_STORAGE_KEY } from './constants.ts';
import type { AgentWire, RunWire } from '../api/types.ts';
import type {
    DecidedApproval,
    NotifiedLine,
    ResumeClaims,
} from './types.ts';

/** `runId` and `approvalId` of a resume token (base64url JSON before the `.`), never verified here. */
export function decodeResumeToken(token: string): ResumeClaims | undefined {
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return undefined;
    try {
        const json = atob(payload.replaceAll('-', '+').replaceAll('_', '/'));
        const value: unknown = JSON.parse(json);
        if (!isObject(value) || typeof value.runId !== 'string' || typeof value.approvalId !== 'string') return undefined;
        return { runId: value.runId, approvalId: value.approvalId };
    } catch {
        return undefined;
    }
}

type Location = {
    path: string;
    query: Record<string, unknown>;
    hash?: string
};

type Redirect = {
    path: string;
    query: LocationQueryRaw;
    hash: string;
    replace: true
};

/** The first non-empty string of a query or fragment value (a repeated key is an array). */
function firstToken(value: unknown): string | undefined {
    const values: unknown[] = Array.isArray(value) ? value : [value];
    return values.find((item): item is string => typeof item === 'string' && item.length > 0);
}

/**
 * A global `beforeEach` (registered before the auth guard): a `token` in
 * the fragment (`#token=...`, the form notifiers should use, since a
 * browser never sends the fragment to a server or proxy) or in the query
 * (`?token=...`, also repeated) moves into `sessionStorage`, and the
 * navigation is redirected to the same location without it (`replace`),
 * so the address bar, the history and a `login?redirect=` never hold it.
 * A query token wins over a fragment token.
 */
export function stripResumeToken(to: Location, storage: Storage): Redirect | undefined {
    const hasQueryToken = Object.hasOwn(to.query, 'token');
    const { token: queryToken, ...query } = to.query;

    let hash = to.hash ?? '';
    let hashToken: string | undefined;
    const fragment = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
    const hasHashToken = fragment.has('token');
    if (hasHashToken) {
        hashToken = firstToken(fragment.getAll('token'));
        fragment.delete('token');
        const rest = fragment.toString();
        hash = rest ? `#${rest}` : '';
    }
    if (!hasQueryToken && !hasHashToken) return undefined;

    const token = firstToken(queryToken) ?? hashToken;
    if (token) storage.setItem(RESUME_STORAGE_KEY, token);
    return {
        path: to.path,
        query: query as LocationQueryRaw,
        hash,
        replace: true,
    };
}

export function readResumeToken(storage: Storage): string | undefined {
    return storage.getItem(RESUME_STORAGE_KEY) ?? undefined;
}

export function clearResumeToken(storage: Storage): void {
    storage.removeItem(RESUME_STORAGE_KEY);
}

/**
 * The inbox's open approvals: every waiting run but the deep link's
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
 * The callout's "notified" line: the notifier's name once the approval was sent,
 * `nobody` for an agent without a notifier, else "not sent (retrying)" (the
 * engine re-sends on every poll). `agent` is `undefined` while unknown (no `run:read`).
 */
export function notifiedLine(run: RunWire, agent: AgentWire | undefined): NotifiedLine {
    if (run.waiting?.notifiedAt) return { text: agent?.notify ?? 'sent', warn: false };
    if (agent && !agent.notify) return { text: 'nobody', warn: false };
    return { text: 'not sent (retrying)', warn: true };
}
