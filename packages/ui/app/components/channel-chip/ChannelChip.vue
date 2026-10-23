<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ChannelChip } from '../../agents/types.ts';

defineProps<{ chip: ChannelChip }>();
</script>

<template>
    <span
        :class="['trig', `trig-${chip.channel}`]"
        :title="chip.id"
        data-testid="channel-chip"
    ><b>{{ chip.channel }}</b><span v-if="chip.detail">{{ chip.detail }}</span></span>
</template>
