<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { useColorMode } from '@vuecs/design';
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import type { MeWire } from '../../api/types.ts';
import { RouteName } from '../../router/constants.ts';
import BrandLogo from '../brand-logo/BrandLogo.vue';
import NavIcon from '../nav-icon/NavIcon.vue';

const props = defineProps<{
    principal?: MeWire;
    /** Waiting approvals, shown as the Approvals badge. */
    waiting?: number;
}>();

const emit = defineEmits<{ signOut: [] }>();

const route = useRoute();
const colorMode = useColorMode();

const items = [
    {
        name: RouteName.RUNS, 
        label: 'Runs', 
        icon: 'runs', 
        also: [RouteName.RUN], 
    },
    {
        name: RouteName.APPROVALS, 
        label: 'Approvals', 
        icon: 'approvals', 
        also: [], 
    },
    {
        name: RouteName.STATE, 
        label: 'Agent state', 
        icon: 'state', 
        also: [], 
    },
    {
        name: RouteName.SCHEDULES, 
        label: 'Schedules', 
        icon: 'schedules', 
        also: [], 
    },
] as const;

function isCurrent(item: typeof items[number]): boolean {
    return route.name === item.name || (item.also as readonly string[]).includes(String(route.name));
}

const displayName = computed(() => props.principal?.name ?? props.principal?.id ?? '');
const initials = computed(() => displayName.value.replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase() || '?');
const grants = computed(() => {
    const count = props.principal?.permissions.length ?? 0;
    return `${props.principal?.kind ?? ''} · ${count} ${count === 1 ? 'grant' : 'grants'}`;
});
</script>

<template>
    <div class="app shell-a">
        <aside class="side">
            <BrandLogo />
            <div style="display: contents">
                <div class="nav-group">
                    Operate
                </div>
            </div>
            <nav aria-label="Main">
                <RouterLink
                    v-for="item in items"
                    :key="item.name"
                    :to="{ name: item.name }"
                    class="nav-item"
                    :aria-current="isCurrent(item) ? 'page' : undefined"
                >
                    <NavIcon :name="item.icon" />
                    {{ item.label }}
                    <VCBadge
                        v-if="item.name === RouteName.APPROVALS && waiting"
                        class="badge"
                        :aria-label="`${waiting} waiting`"
                    >
                        {{ waiting }}
                    </VCBadge>
                </RouterLink>
            </nav>
            <div class="who">
                <VCAvatar class="avatar">
                    <VCAvatarFallback>{{ initials }}</VCAvatarFallback>
                </VCAvatar>
                <div class="who-text">
                    <div
                        class="who-name"
                        data-testid="principal"
                    >
                        {{ displayName }}
                    </div>
                    <div
                        class="muted mono"
                        style="font-size: 11px"
                    >
                        {{ grants }}
                    </div>
                </div>
                <div class="who-actions">
                    <button
                        type="button"
                        class="icon-btn"
                        :title="colorMode.isDark.value ? 'Light mode' : 'Dark mode'"
                        :aria-label="colorMode.isDark.value ? 'Light mode' : 'Dark mode'"
                        @click="colorMode.toggle()"
                    >
                        <NavIcon :name="colorMode.isDark.value ? 'sun' : 'moon'" />
                    </button>
                    <button
                        type="button"
                        class="icon-btn"
                        title="Sign out"
                        aria-label="Sign out"
                        @click="emit('signOut')"
                    >
                        <NavIcon name="logout" />
                    </button>
                </div>
            </div>
        </aside>
        <main class="main-a">
            <slot />
        </main>
    </div>
</template>
