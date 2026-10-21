<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { TriggerChip } from '../../agents/types.ts';

defineProps<{ chip: TriggerChip }>();
</script>

<template>
    <span
        :class="['trig', `trig-${chip.source}`]"
        :title="chip.id"
    ><b>{{ chip.source }}</b><span v-if="chip.detail">{{ chip.detail }}</span></span>
</template>
