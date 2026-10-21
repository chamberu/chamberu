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
    <header class="page-head">
        <div class="page-head-main">
            <div class="crumbs">
                operate <i>/</i> {{ title.toLowerCase() }}
            </div>
            <h1 class="display">
                {{ title }}
            </h1>
            <p v-if="lede">
                {{ lede }}
            </p>
        </div>
        <div
            v-if="$slots.default"
            class="page-head-aside"
        >
            <slot />
        </div>
    </header>
</template>
