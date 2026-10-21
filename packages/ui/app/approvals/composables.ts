/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    computed,
    onScopeDispose,
    shallowRef,
    watch,
} from 'vue';
import type { Ref } from 'vue';
import { ApiError } from '../api/error.ts';
import type { IApiClient, RunDetail, RunWire } from '../api/types.ts';
import { createPoller } from '../polling/module.ts';
import { asApiError } from '../api/helpers.ts';
import { INBOX_PAGE_SIZE, INBOX_POLL_MS } from './constants.ts';
import { clearResumeToken, decodeResumeToken } from './helpers.ts';
import type { AnswerResult } from './types.ts';

function reasonOf(reason: string | undefined): { reason?: string } {
    const trimmed = reason?.trim();
    return trimmed ? { reason: trimmed } : {};
}

/**
 * The approvals inbox: waiting runs, newest first, polled every
 * `INBOX_POLL_MS`. `answer` approves or denies the run's current wait
 * point by id (`POST /runs/:id/approve`): a 409 (answered meanwhile,
 * expired, or moved on to another approval) is `already-answered`, a 403
 * `forbidden`; the list refreshes either way.
 */
export function useApprovals(client: IApiClient) {
    const runs = shallowRef<RunWire[]>([]);
    const error = shallowRef<ApiError>();
    const poller = createPoller(async () => {
        try {
            const page = await client.listRuns({
                status: ['waiting'],
                limit: INBOX_PAGE_SIZE,
                offset: 0,
            });
            runs.value = page.data.filter((run) => run.waiting);
            error.value = undefined;
        } catch (e) {
            error.value = asApiError(e);
        }
    }, INBOX_POLL_MS);
    poller.start();
    onScopeDispose(() => poller.stop());

    async function answer(run: RunWire, approved: boolean, reason?: string): Promise<AnswerResult> {
        if (!run.waiting) return 'already-answered';
        try {
            await client.approve(run.id, {
                approvalId: run.waiting.approvalId,
                approved,
                ...reasonOf(reason),
            });
            return 'answered';
        } catch (e) {
            if (e instanceof ApiError && e.status === 409) return 'already-answered';
            if (e instanceof ApiError && e.status === 403) return 'forbidden';
            throw e;
        } finally {
            void poller.refresh();
        }
    }

    return {
        runs,
        error,
        refresh: () => poller.refresh(),
        answer,
    };
}

/**
 * The approval a notifier's deep link names: its run when readable (else
 * only the ids decoded from the token), answered through `POST /resume`
 * with the token; any final answer clears the stored token. An invalid,
 * expired or spent token (400) and a run that moved on (409) are
 * `already-answered`; 403 keeps the token for another principal.
 */
export function useDeepLinkApproval(client: IApiClient, token: Ref<string | undefined>, storage: Storage) {
    const run = shallowRef<RunWire>();
    const error = shallowRef<ApiError>();
    const claims = computed(() => (token.value ? decodeResumeToken(token.value) : undefined));

    watch(claims, async (value) => {
        run.value = undefined;
        if (!value) return;
        try {
            const detail: Partial<RunDetail> = { ...await client.getRun(value.runId) };
            delete detail.steps;
            run.value = detail as RunWire;
        } catch (e) {
            error.value = asApiError(e);
        }
    }, { immediate: true });

    async function answer(approved: boolean, reason?: string): Promise<AnswerResult> {
        if (!token.value) return 'already-answered';
        try {
            await client.resume({
                token: token.value,
                approved,
                ...reasonOf(reason),
            });
            clearResumeToken(storage);
            return 'answered';
        } catch (e) {
            if (e instanceof ApiError && (e.status === 400 || e.status === 409)) {
                clearResumeToken(storage);
                return 'already-answered';
            }
            if (e instanceof ApiError && e.status === 403) return 'forbidden';
            throw e;
        }
    }

    return {
        run,
        error,
        claims,
        answer,
    };
}
