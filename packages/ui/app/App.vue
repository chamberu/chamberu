<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { computed } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import AppShell from './components/app-shell/AppShell.vue';

const route = useRoute();
const bare = computed(() => route.meta.public === true);
</script>

<template>
    <RouterView v-if="bare" />
    <AppShell v-else>
        <RouterView />
    </AppShell>
</template>
