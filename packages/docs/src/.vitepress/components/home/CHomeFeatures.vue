<!--
  - Copyright (c) 2026.
  - Author Peter Placzek (tada5hi)
  - For the full copyright and license information,
  - view the LICENSE file that was distributed with this source code.
  -->
<script lang="ts">
import { defineComponent } from 'vue';
import { useHome } from './use-home';

export default defineComponent({
    name: 'CHomeFeatures',
    setup() {
        return { features: useHome('features') };
    },
});
</script>
<template>
    <section class="ch-section">
        <div class="ch-wrap">
            <p class="ch-eyebrow">
                {{ features.eyebrow }}
            </p>
            <h2 class="ch-heading max-w-[22ch]">
                {{ features.title }}
            </h2>
            <ul class="m-0 mt-12 grid list-none grid-cols-1 gap-px overflow-hidden rounded-sm border border-line bg-line p-0 md:grid-cols-3">
                <li
                    v-for="(item, index) in features.items"
                    :key="item.title"
                    class="flex flex-col bg-paper p-6 md:p-8"
                >
                    <span class="font-mono text-xs text-muted">0{{ index + 1 }}</span>
                    <h3 class="ch-display mt-4 text-xl text-ink md:text-2xl">
                        {{ item.title }}
                    </h3>
                    <p class="m-0 mt-3 leading-relaxed text-muted">
                        {{ item.body }}
                    </p>
                    <p
                        v-if="item.detail"
                        class="m-0 mt-auto pt-6"
                    >
                        <code class="ch-chip">{{ item.detail }}</code>
                    </p>
                </li>
            </ul>
        </div>
    </section>
</template>
