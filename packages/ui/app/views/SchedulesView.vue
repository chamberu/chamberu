<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { computed } from 'vue';
import ExpiryCountdown from '../components/expiry-countdown/ExpiryCountdown.vue';
import PageHead from '../components/page-head/PageHead.vue';
import { useAppContext } from '../context/module.ts';
import { useSchedules } from '../schedules/composables.ts';
import { formatFireTime, groupByAgent } from '../schedules/helpers.ts';

const { client } = useAppContext();
const { schedules, error } = useSchedules(client);
const groups = computed(() => groupByAgent(schedules.value));
</script>

<template>
    <PageHead
        title="Schedules"
        lede="Cron triggers per agent and when they fire next. Times are in each trigger's time zone."
    />

    <div
        v-if="error?.status === 403"
        class="card notice"
    >
        Listing schedules needs <b class="mono">run:read</b>.
    </div>
    <div
        v-else-if="groups.length === 0"
        class="card notice"
    >
        No agent has a cron trigger.
    </div>
    <section
        v-for="group in groups"
        :key="group.agent"
        class="sched-group"
    >
        <div class="sched-cards">
            <div
                v-for="schedule in group.schedules"
                :key="schedule.trigger"
                class="card sched"
                data-testid="schedule"
            >
                <div class="sched-top">
                    <b style="font-weight: 600">{{ schedule.agent }}</b>
                    <span
                        class="mono muted"
                        style="font-size: 12px"
                    >{{ schedule.trigger }}</span>
                </div>
                <div>
                    <span class="cron">{{ schedule.expression }}</span>
                    <span
                        class="muted"
                        style="font-size: 13px"
                    > {{ schedule.timezone ?? 'server time zone' }}</span>
                </div>
                <div>
                    <span class="field-label">Next fire in</span>
                    <div class="sched-next">
                        <ExpiryCountdown
                            :until="schedule.nextAt"
                            :soon-ms="0"
                        />
                        <span
                            class="muted"
                            style="font-size: 13px"
                        >{{ formatFireTime(schedule.nextAt, schedule.timezone) }}</span>
                    </div>
                </div>
                <div class="kv-line">
                    <span>overlap <b class="mono">{{ schedule.overlap }}</b></span>
                </div>
            </div>
        </div>
    </section>
</template>
