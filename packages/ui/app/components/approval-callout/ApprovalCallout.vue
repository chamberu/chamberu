<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import type { AgentWire, RunWire } from '../../api/types.ts';
import { notifiedLine } from '../../approvals/helpers.ts';
import { RouteName } from '../../router/constants.ts';
import { shortId } from '../../runs/helpers.ts';
import ExpiryCountdown from '../expiry-countdown/ExpiryCountdown.vue';
import JsonBlock from '../json-block/JsonBlock.vue';
import NavIcon from '../nav-icon/NavIcon.vue';
import StatusChip from '../status-chip/StatusChip.vue';

const props = defineProps<{
    run: RunWire;
    /** The principal holds `agent:<agent>:approve`. */
    canAnswer: boolean;
    busy?: boolean;
    /** The run's agent (`GET /agents`), for its notifier; `undefined` while unknown. */
    summary?: AgentWire;
}>();

const emit = defineEmits<{ answer: [approved: boolean, reason: string] }>();
const reason = ref('');

function send(approved: boolean): void {
    emit('answer', approved, reason.value);
}

const id = `reason-${props.run.id}`;
const notified = computed(() => notifiedLine(props.run, props.summary));
</script>

<template>
    <article
        v-if="run.waiting"
        class="callout"
        data-testid="approval"
        :data-run="run.id"
    >
        <div class="callout-head">
            <span class="callout-icon"><NavIcon name="hand" /></span>
            <div class="callout-title">
                <h2>{{ run.waiting.toolName }}<StatusChip status="waiting" /></h2>
                <p>
                    <RouterLink
                        :to="{ name: RouteName.AGENT, params: { name: run.agent } }"
                        data-testid="agent-link"
                    >
                        {{ run.agent }}
                    </RouterLink>
                    · run
                    <RouterLink
                        class="mono"
                        :to="{ name: RouteName.RUN, params: { id: run.id } }"
                    >
                        {{ shortId(run.id) }}
                    </RouterLink>
                    <template v-if="run.concurrencyKey">
                        · {{ run.concurrencyKey }}
                    </template>
                </p>
            </div>
            <div class="timer">
                <small>Expires in</small>
                <ExpiryCountdown :until="run.waiting.expiresAt" />
                <span>then denied</span>
            </div>
        </div>
        <div class="callout-body">
            <div>
                <span class="field-label">Tool input</span>
                <JsonBlock :value="run.waiting.input" />
            </div>
            <div>
                <dl class="callout-meta">
                    <dt>requested</dt>
                    <dd><VCTimeago :datetime="run.updatedAt" /></dd>
                    <dt>notified</dt>
                    <dd
                        :class="{ warn: notified.warn }"
                        data-testid="notified"
                    >
                        {{ notified.text }}
                    </dd>
                </dl>
                <label
                    v-if="canAnswer"
                    class="field"
                    :for="id"
                >
                    <span class="field-label">Reason (optional, sent to the model)</span>
                    <VCFormTextarea
                        :id="id"
                        v-model="reason"
                        class="textarea"
                        rows="3"
                        placeholder="Why, in one line"
                    />
                </label>
            </div>
        </div>
        <div class="callout-foot">
            <p v-if="canAnswer">
                Approving or denying queues the run again.
            </p>
            <p v-else>
                Answering needs <span class="mono">agent:{{ run.agent }}:approve</span>.
            </p>
            <div
                v-if="canAnswer"
                class="callout-actions"
            >
                <VCButton
                    class="btn"
                    :disabled="busy"
                    @click="send(false)"
                >
                    Deny
                </VCButton>
                <VCButton
                    class="btn btn-primary"
                    :loading="busy"
                    @click="send(true)"
                >
                    <NavIcon name="check" />Approve
                </VCButton>
            </div>
        </div>
    </article>
</template>
