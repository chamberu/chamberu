<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

defineProps<{ name: 'runs' | 'approvals' | 'state' | 'schedules' | 'sun' | 'moon' | 'logout' }>();
</script>

<template>
    <svg
        viewBox="0 0 16 16"
        aria-hidden="true"
    >
        <path
            v-if="name === 'runs'"
            d="M2 4h12M2 8h12M2 12h8"
        />
        <path
            v-else-if="name === 'approvals'"
            d="M3 8.5l3 3 7-7"
        />
        <template v-else-if="name === 'state'">
            <ellipse
                cx="8"
                cy="4"
                rx="5"
                ry="2"
            />
            <path d="M3 4v8c0 1.1 2.2 2 5 2s5-.9 5-2V4M3 8c0 1.1 2.2 2 5 2s5-.9 5-2" />
        </template>
        <template v-else-if="name === 'schedules'">
            <circle
                cx="8"
                cy="8"
                r="6"
            />
            <path d="M8 4.5V8l2.5 1.5" />
        </template>
        <template v-else-if="name === 'sun'">
            <circle
                cx="8"
                cy="8"
                r="3"
            />
            <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" />
        </template>
        <path
            v-else-if="name === 'moon'"
            d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5z"
        />
        <path
            v-else
            d="M6 2.5H3.5v11H6M10 5l3 3-3 3M13 8H6"
        />
    </svg>
</template>
