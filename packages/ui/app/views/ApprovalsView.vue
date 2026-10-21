<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { useToast } from '@vuecs/overlays';
import { computed, inject, ref } from 'vue';
import { RouterLink } from 'vue-router';
import type { RunWire } from '../api/types.ts';
import { useApprovals, useDeepLinkApproval } from '../approvals/composables.ts';
import { INBOX, INBOX_POLL_MS  } from '../approvals/constants.ts';
import { readResumeToken } from '../approvals/helpers.ts';
import type { AnswerResult } from '../approvals/types.ts';
import { hasPermission } from '../auth/helpers.ts';
import ApprovalCallout from '../components/approval-callout/ApprovalCallout.vue';
import PageHead from '../components/page-head/PageHead.vue';
import StatusChip from '../components/status-chip/StatusChip.vue';
import { useAppContext } from '../context/module.ts';
import { RouteName } from '../router/constants.ts';
import { shortId } from '../runs/helpers.ts';

type Decided = {
    run: RunWire;
    result: AnswerResult;
    approved: boolean;
    reason?: string
};

const {
    client,
    session,
    storage,
} = useAppContext();
const toast = useToast();
const inbox = inject(INBOX, undefined) ?? useApprovals(client);

const token = ref(readResumeToken(storage));
const deepLink = useDeepLinkApproval(client, token, storage);

const permissions = computed(() => session.principal.value?.permissions ?? []);
const canAnswer = (agent: string) => hasPermission(permissions.value, `agent:${agent}:approve`);

const decided = ref<Decided[]>([]);
const busy = ref<string>();
const linkRunId = computed(() => (token.value ? deepLink.claims.value?.runId : undefined));
const pending = computed(() => inbox.runs.value.filter((run) => run.id !== linkRunId.value &&
    decided.value.every((d) => !(d.run.id === run.id && d.result === 'answered'))));

const MESSAGES: Record<AnswerResult, (approved: boolean) => string> = {
    answered: (approved) => (approved ? 'Approved' : 'Denied'),
    'already-answered': () => 'Already answered, expired or moved on',
    forbidden: () => 'Not allowed to answer',
};

async function answer(run: RunWire, approved: boolean, reason: string): Promise<void> {
    busy.value = run.id;
    try {
        const result = await inbox.answer(run, approved, reason);
        decided.value = [{
            run,
            result,
            approved,
            reason: reason.trim() || undefined,
        }, ...decided.value.filter((d) => d.run.id !== run.id)];
        toast.add({ title: `${MESSAGES[result](approved)} · run ${shortId(run.id)}`, color: result === 'answered' ? 'success' : 'warning' });
    } catch (e) {
        toast.add({
            title: 'The answer failed',
            description: e instanceof Error ? e.message : String(e),
            color: 'error',
        });
    } finally {
        busy.value = undefined;
    }
}

const linkResult = ref<{ result: AnswerResult; approved: boolean }>();
async function answerLink(approved: boolean, reason: string): Promise<void> {
    busy.value = 'link';
    try {
        const result = await deepLink.answer(approved, reason);
        linkResult.value = { result, approved };
        if (result !== 'forbidden') token.value = undefined;
        toast.add({ title: MESSAGES[result](approved), color: result === 'answered' ? 'success' : 'warning' });
        void inbox.refresh();
    } catch (e) {
        toast.add({
            title: 'The answer failed',
            description: e instanceof Error ? e.message : String(e),
            color: 'error',
        });
    } finally {
        busy.value = undefined;
    }
}
</script>

<template>
    <PageHead
        title="Approvals"
        lede="Tool calls waiting for a person. Approving or denying queues the run again; the model sees your reason."
    >
        <span :class="['live', { off: !!inbox.error.value }]">polling · {{ INBOX_POLL_MS / 1000 }} s</span>
    </PageHead>

    <template v-if="token && deepLink.claims.value">
        <ApprovalCallout
            v-if="deepLink.run.value?.waiting && deepLink.run.value.waiting.approvalId === deepLink.claims.value.approvalId"
            :run="deepLink.run.value"
            :can-answer="true"
            :busy="busy === 'link'"
            data-testid="deep-link"
            @answer="answerLink"
        />
        <div
            v-else
            class="callout"
            data-testid="deep-link"
        >
            <div class="callout-head">
                <h2>Approval from a link</h2>
                <span
                    class="muted mono"
                    style="font-size: 12px"
                >run {{ deepLink.claims.value.runId }} · approval {{ deepLink.claims.value.approvalId }}</span>
            </div>
            <p
                class="hint"
                style="margin: 0"
            >
                <template v-if="deepLink.run.value">
                    This run is no longer waiting for this approval.
                </template>
                <template v-else>
                    The run is not readable with your grants; the link's token still answers it.
                </template>
            </p>
            <div class="callout-actions">
                <VCButton
                    variant="outline"
                    color="neutral"
                    :disabled="busy === 'link'"
                    @click="answerLink(false, '')"
                >
                    Deny
                </VCButton>
                <VCButton
                    :loading="busy === 'link'"
                    @click="answerLink(true, '')"
                >
                    Approve
                </VCButton>
            </div>
        </div>
    </template>
    <div
        v-else-if="linkResult"
        :class="['callout', linkResult.result === 'answered' && linkResult.approved ? 'done' : 'denied']"
        data-testid="deep-link-result"
    >
        <div class="callout-head">
            <h2>{{ MESSAGES[linkResult.result](linkResult.approved) }}</h2>
            <span
                v-if="linkResult.result === 'already-answered'"
                class="muted"
                style="font-size: 13px"
            >The link's token is expired or already used.</span>
        </div>
    </div>

    <div
        v-if="inbox.error.value?.status === 403"
        class="card notice"
    >
        Listing waiting runs needs <b class="mono">run:read</b>. An approval link from a notification still works.
    </div>

    <div
        v-for="entry in decided"
        :key="`decided-${entry.run.id}`"
        :class="['callout', entry.result === 'answered' && entry.approved ? 'done' : 'denied']"
        data-testid="decided"
    >
        <div class="callout-head">
            <h2>{{ entry.run.waiting?.toolName }}</h2>
            <span
                class="muted mono"
                style="font-size: 12px"
            >run <RouterLink :to="{ name: RouteName.RUN, params: { id: entry.run.id } }">{{ shortId(entry.run.id) }}</RouterLink></span>
            <StatusChip
                v-if="entry.result === 'answered'"
                status="queued"
            />
            <span
                class="muted push"
                style="font-size: 13px"
            >
                {{ MESSAGES[entry.result](entry.approved) }}<template v-if="entry.reason">: “{{ entry.reason }}”</template>
            </span>
        </div>
    </div>

    <ApprovalCallout
        v-for="run in pending"
        :key="`${run.id}-${run.waiting?.approvalId}`"
        :run="run"
        :can-answer="canAnswer(run.agent)"
        :busy="busy === run.id"
        @answer="(approved, reason) => answer(run, approved, reason)"
    />

    <div
        v-if="!inbox.error.value && pending.length === 0 && !token"
        class="card notice"
    >
        Nothing waits for an approval.
    </div>
</template>
