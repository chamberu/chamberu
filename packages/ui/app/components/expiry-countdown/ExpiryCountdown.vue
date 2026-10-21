<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { computed } from 'vue';
import { formatCountdown } from './helpers.ts';

const props = defineProps<{ until: string; soonMs?: number }>();
const remaining = computed(() => Math.max(0, Date.parse(props.until) - Date.now()));
</script>

<template>
    <VCCountdown
        :key="until"
        :time="remaining"
        as="b"
    >
        <template #default="{ totalMilliseconds }">
            <span :class="['countdown', { soon: totalMilliseconds < (soonMs ?? 3 * 3600 * 1000) }]">{{ formatCountdown(totalMilliseconds) }}</span>
        </template>
    </VCCountdown>
</template>
