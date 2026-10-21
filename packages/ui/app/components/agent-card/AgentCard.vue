<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { useRouter } from 'vue-router';
import type { AgentRollup, TriggerChip as Chip } from '../../agents/types.ts';
import type { AgentWire } from '../../api/types.ts';
import { RouteName } from '../../router/constants.ts';
import { shortId } from '../../runs/helpers.ts';
import ActivityStrip from '../activity-strip/ActivityStrip.vue';
import ExpiryCountdown from '../expiry-countdown/ExpiryCountdown.vue';
import NavIcon from '../nav-icon/NavIcon.vue';
import StatusChip from '../status-chip/StatusChip.vue';
import TriggerChip from '../trigger-chip/TriggerChip.vue';

const props = defineProps<{
    agent: AgentWire;
    chips: Chip[];
    rollup?: AgentRollup;
}>();

const router = useRouter();

function open(): void {
    void router.push({ name: RouteName.AGENT, params: { name: props.agent.name } });
}
</script>

<template>
    <article
        class="card agent-card"
        tabindex="0"
        role="link"
        :aria-label="`Open agent ${agent.name}`"
        data-testid="agent-card"
        :data-agent="agent.name"
        @click="open"
        @keydown.enter="open"
    >
        <div class="agent-top">
            <h2 class="display">
                {{ agent.name }}
            </h2>
            <NavIcon name="go" />
        </div>
        <div class="trigs">
            <TriggerChip
                v-for="chip in chips"
                :key="chip.id"
                :chip="chip"
            />
        </div>
        <template v-if="rollup">
            <div class="nums">
                <div :class="['n-run', { zero: !rollup.running }]">
                    <small>Running</small><b>{{ rollup.running }}</b>
                </div>
                <div :class="['n-wait', { zero: !rollup.waiting }]">
                    <small>Waiting</small><b>{{ rollup.waiting }}</b>
                </div>
                <div :class="{ zero: !rollup.nextFire }">
                    <small>Next cron</small>
                    <ExpiryCountdown
                        v-if="rollup.nextFire"
                        :until="rollup.nextFire.nextAt"
                        :soon-ms="0"
                    />
                    <b
                        v-else
                        class="mono"
                    >–</b>
                </div>
            </div>
            <ActivityStrip :activity="rollup.activity" />
            <div class="last">
                <span class="field-label">Last run</span>
                <div
                    v-if="rollup.last"
                    class="last-row"
                >
                    <StatusChip :status="rollup.last.status" />
                    <RouterLink
                        class="id"
                        :to="{ name: RouteName.RUN, params: { id: rollup.last.id } }"
                        @click.stop
                    >
                        {{ shortId(rollup.last.id) }}
                    </RouterLink>
                    <span class="when"><VCTimeago :datetime="rollup.last.createdAt" /></span>
                </div>
                <p v-else>
                    No runs yet.<template v-if="chips.some((c) => c.source === 'http')">
                        Start one from its page.
                    </template>
                </p>
            </div>
        </template>
        <dl class="agent-foot">
            <div>
                <dt>Notifies</dt>
                <dd :class="{ none: !agent.notify }">
                    {{ agent.notify ?? 'nobody' }}
                </dd>
            </div>
            <div>
                <dt>Approval</dt>
                <dd
                    v-if="agent.approvals.length"
                >
                    <span
                        v-for="tool in agent.approvals"
                        :key="tool"
                        class="tag tag-approve"
                    >{{ tool }}</span>
                </dd>
                <dd
                    v-else
                    class="none"
                >
                    no tools need approval
                </dd>
            </div>
        </dl>
    </article>
</template>
