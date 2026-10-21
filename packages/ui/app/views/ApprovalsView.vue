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
import { useAgents } from '../agents/composables.ts';
import type { RunWire } from '../api/types.ts';
import { useApprovals, useDeepLinkApproval } from '../approvals/composables.ts';
import { INBOX, INBOX_POLL_MS  } from '../approvals/constants.ts';
import { pendingApprovals, readResumeToken } from '../approvals/helpers.ts';
import type { AnswerResult, DecidedApproval } from '../approvals/types.ts';
import { hasPermission } from '../auth/helpers.ts';
import ApprovalCallout from '../components/approval-callout/ApprovalCallout.vue';
import EmptyState from '../components/empty-state/EmptyState.vue';
import NavIcon from '../components/nav-icon/NavIcon.vue';
import PageHead from '../components/page-head/PageHead.vue';
import StatusChip from '../components/status-chip/StatusChip.vue';
import { useAppContext } from '../context/module.ts';
import { RouteName } from '../router/constants.ts';
import { shortId } from '../runs/helpers.ts';

const {
    client,
    session,
    storage,
} = useAppContext();
const toast = useToast();
const inbox = inject(INBOX, undefined) ?? useApprovals(client);

const token = ref(readResumeToken(storage));
const deepLink = useDeepLinkApproval(client, token, storage);

const { agents } = useAgents(client);
const summaryOf = (agent: string) => agents.value.find((a) => a.name === agent);
const principalName = computed(() => session.principal.value?.name ?? session.principal.value?.id);

const permissions = computed(() => session.principal.value?.permissions ?? []);
const canAnswer = (agent: string) => hasPermission(permissions.value, `agent:${agent}:approve`);

const decided = ref<DecidedApproval[]>([]);
const busy = ref<string>();
const linkRunId = computed(() => (token.value ? deepLink.claims.value?.runId : undefined));
const pending = computed(() => pendingApprovals(inbox.runs.value, decided.value, linkRunId.value));

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
            by: principalName.value,
            at: new Date().toISOString(),
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

    <div class="callouts">
        <template v-if="token && deepLink.claims.value">
            <ApprovalCallout
                v-if="deepLink.run.value?.waiting && deepLink.run.value.waiting.approvalId === deepLink.claims.value.approvalId"
                :run="deepLink.run.value"
                :can-answer="true"
                :summary="summaryOf(deepLink.run.value.agent)"
                :busy="busy === 'link'"
                data-testid="deep-link"
                @answer="answerLink"
            />
            <article
                v-else
                class="callout"
                data-testid="deep-link"
            >
                <div class="callout-head">
                    <span class="callout-icon"><NavIcon name="hand" /></span>
                    <div class="callout-title">
                        <h2>Approval from a link</h2>
                        <p class="mono">
                            run {{ deepLink.claims.value.runId }} · approval {{ deepLink.claims.value.approvalId }}
                        </p>
                    </div>
                </div>
                <div class="callout-body single">
                    <p class="hint">
                        <template v-if="deepLink.run.value">
                            This run is no longer waiting for this approval.
                        </template>
                        <template v-else>
                            The run is not readable with your grants; the link's token still answers it.
                        </template>
                    </p>
                </div>
                <div class="callout-foot">
                    <p>The link's token answers through the resume endpoint.</p>
                    <div class="callout-actions">
                        <VCButton
                            class="btn"
                            :disabled="busy === 'link'"
                            @click="answerLink(false, '')"
                        >
                            Deny
                        </VCButton>
                        <VCButton
                            class="btn btn-primary"
                            :loading="busy === 'link'"
                            @click="answerLink(true, '')"
                        >
                            <NavIcon name="check" />Approve
                        </VCButton>
                    </div>
                </div>
            </article>
        </template>
        <div
            v-else-if="linkResult"
            :class="['callout', 'decided', { denied: !(linkResult.result === 'answered' && linkResult.approved) }]"
            data-testid="deep-link-result"
        >
            <div class="callout-head">
                <span class="callout-icon"><NavIcon :name="linkResult.result === 'answered' && linkResult.approved ? 'check' : 'cross'" /></span>
                <div class="callout-title">
                    <h2>{{ MESSAGES[linkResult.result](linkResult.approved) }}</h2>
                    <p v-if="linkResult.result === 'already-answered'">
                        The link's token is expired or already used.
                    </p>
                </div>
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
            :class="['callout', 'decided', { denied: !(entry.result === 'answered' && entry.approved) }]"
            data-testid="decided"
        >
            <div class="callout-head">
                <span class="callout-icon"><NavIcon :name="entry.result === 'answered' && entry.approved ? 'check' : 'cross'" /></span>
                <div class="callout-title">
                    <h2>
                        {{ entry.run.waiting?.toolName }}
                        <StatusChip
                            v-if="entry.result === 'answered'"
                            status="queued"
                        />
                    </h2>
                    <p>
                        <RouterLink
                            :to="{ name: RouteName.AGENT, params: { name: entry.run.agent } }"
                            data-testid="agent-link"
                        >
                            {{ entry.run.agent }}
                        </RouterLink> · run
                        <RouterLink
                            class="mono"
                            :to="{ name: RouteName.RUN, params: { id: entry.run.id } }"
                        >
                            {{ shortId(entry.run.id) }}
                        </RouterLink>
                    </p>
                </div>
                <span class="decision">
                    <b>{{ MESSAGES[entry.result](entry.approved) }}</b>
                    <template v-if="entry.result === 'answered' && entry.by"> by {{ entry.by }}</template>
                    <template v-if="entry.reason">: “{{ entry.reason }}”</template>
                    <template v-if="entry.at">
                        <span> · </span>
                        <VCTimeago :datetime="entry.at" />
                    </template>
                </span>
            </div>
        </div>

        <ApprovalCallout
            v-for="run in pending"
            :key="`${run.id}-${run.waiting?.approvalId}`"
            :run="run"
            :can-answer="canAnswer(run.agent)"
            :summary="summaryOf(run.agent)"
            :busy="busy === run.id"
            @answer="(approved, reason) => answer(run, approved, reason)"
        />

        <div
            v-if="!inbox.error.value && pending.length === 0 && !token"
            class="card"
        >
            <EmptyState
                icon="check"
                title="Nothing waiting for you"
                text="Every paused tool call has an answer. New ones appear here and in your notifier."
            />
        </div>
    </div>
</template>
