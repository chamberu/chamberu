<script setup lang="ts" generic="T extends string">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { nextTick } from 'vue';
import { onTabKeydown, panelId, tabId } from './helpers.ts';

/**
 * An ARIA tab list: one Tab stop (the selected tab), arrow keys, Home and End
 * select and focus; the panel is the caller's element with `id = panelId(prefix)`.
 */
const props = defineProps<{
    tabs: readonly T[];
    prefix: string;
    label: string;
}>();

const selected = defineModel<T>({ required: true });

const onKeydown = (event: Parameters<typeof onTabKeydown>[0]) => onTabKeydown(event, props.tabs, selected.value, props.prefix, async (tab) => {
    selected.value = tab;
    await nextTick();
});
</script>

<template>
    <div
        class="tabs"
        role="tablist"
        :aria-label="label"
        @keydown="onKeydown"
    >
        <button
            v-for="tab in tabs"
            :id="tabId(prefix, tab)"
            :key="tab"
            type="button"
            role="tab"
            :aria-selected="selected === tab"
            :aria-controls="panelId(prefix)"
            :tabindex="selected === tab ? 0 : -1"
            @click="selected = tab"
        >
            <slot
                name="tab"
                :tab="tab"
            />
        </button>
    </div>
</template>
