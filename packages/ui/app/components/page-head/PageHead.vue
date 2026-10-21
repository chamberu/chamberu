<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

defineProps<{ title: string; lede?: string }>();
</script>

<template>
    <div class="page-head">
        <div>
            <p class="eyebrow">
                chamvi
            </p>
            <h1 class="display">
                {{ title }}
            </h1>
            <p v-if="lede">
                {{ lede }}
            </p>
        </div>
        <slot />
    </div>
</template>
