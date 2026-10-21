<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ref } from 'vue';
import { RouterLink } from 'vue-router';
import type { RunWire } from '../../api/types.ts';
import { RouteName } from '../../router/constants.ts';
import { shortId } from '../../runs/helpers.ts';
import ExpiryCountdown from '../expiry-countdown/ExpiryCountdown.vue';
import JsonBlock from '../json-block/JsonBlock.vue';
import StatusChip from '../status-chip/StatusChip.vue';

const props = defineProps<{
    run: RunWire;
    /** The principal holds `agent:<agent>:approve`. */
    canAnswer: boolean;
    busy?: boolean;
}>();

const emit = defineEmits<{ answer: [approved: boolean, reason: string] }>();
const reason = ref('');

function send(approved: boolean): void {
    emit('answer', approved, reason.value);
}

const id = `reason-${props.run.id}`;
</script>

<template>
    <div
        v-if="run.waiting"
        class="callout"
        data-testid="approval"
        :data-run="run.id"
    >
        <div class="callout-head">
            <h2>{{ run.waiting.toolName }}</h2>
            <StatusChip status="waiting" />
            <span
                class="muted"
                style="font-size: 13px"
            >
                {{ run.agent }} ·
                <RouterLink
                    class="mono"
                    style="font-weight: 500"
                    :to="{ name: RouteName.RUN, params: { id: run.id } }"
                >{{ shortId(run.id) }}</RouterLink>
                <template v-if="run.concurrencyKey"> · {{ run.concurrencyKey }}</template>
            </span>
        </div>
        <div class="approval-grid">
            <div style="display: grid; gap: 8px; min-width: 0; align-content: start">
                <span class="field-label">Tool input</span>
                <JsonBlock :value="run.waiting.input" />
            </div>
            <div class="approval-side">
                <div
                    class="kv-line"
                    style="display: grid; gap: 4px"
                >
                    <span>requested <b><VCTimeago :datetime="run.updatedAt" /></b></span>
                    <span>expires in <ExpiryCountdown :until="run.waiting.expiresAt" /> <span class="muted">(then denied)</span></span>
                    <span>notified <b>{{ run.waiting.notifiedAt ? 'yes' : 'not sent yet' }}</b></span>
                </div>
                <template v-if="canAnswer">
                    <label
                        class="field"
                        :for="id"
                    >
                        <span class="field-label">Reason (optional, sent to the model)</span>
                        <VCFormTextarea
                            :id="id"
                            v-model="reason"
                            rows="2"
                            placeholder="Why, in one line"
                        />
                    </label>
                    <div class="callout-actions">
                        <VCButton
                            variant="outline"
                            color="neutral"
                            :disabled="busy"
                            @click="send(false)"
                        >
                            Deny
                        </VCButton>
                        <VCButton
                            :loading="busy"
                            @click="send(true)"
                        >
                            Approve
                        </VCButton>
                    </div>
                </template>
                <p
                    v-else
                    class="hint"
                >
                    Answering needs <span class="mono">agent:{{ run.agent }}:approve</span>.
                </p>
            </div>
        </div>
    </div>
</template>
