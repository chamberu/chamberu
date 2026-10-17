<!--
  - Copyright (c) 2026.
  - Author Peter Placzek (tada5hi)
  - For the full copyright and license information,
  - view the LICENSE file that was distributed with this source code.
  -->
<script lang="ts">
import { VPLink } from 'vitepress/theme';
import { defineComponent } from 'vue';
import { useHome } from './use-home';

const PLANNED_CLASS = 'm-0 mt-4 grid list-none grid-cols-1 gap-px overflow-hidden rounded-sm border border-line bg-line p-0 sm:grid-cols-2 lg:grid-cols-3';

export default defineComponent({
    name: 'CHomePackages',
    components: { VPLink },
    setup() {
        return {
            packages: useHome('packages'),
            plannedClass: PLANNED_CLASS,
        };
    },
});
</script>
<template>
    <section class="ch-section">
        <div class="ch-wrap">
            <p class="ch-eyebrow">
                {{ packages.eyebrow }}
            </p>
            <h2 class="ch-heading">
                {{ packages.title }}
            </h2>
            <p class="ch-lede">
                {{ packages.lead }}
            </p>

            <div class="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2">
                <VPLink
                    v-for="item in packages.shipped"
                    :key="item.name"
                    :href="item.link"
                    class="ch-card group flex flex-col p-6 no-underline transition-colors duration-150 hover:border-accent md:p-8"
                >
                    <span class="flex flex-wrap items-center justify-between gap-3">
                        <code class="font-mono text-base font-medium text-ink">{{ item.name }}</code>
                        <span class="ch-chip ch-chip-accent">shipped</span>
                    </span>
                    <span class="mt-4 leading-relaxed text-muted">{{ item.body }}</span>
                    <span class="ch-link mt-6 group-hover:underline group-hover:underline-offset-4">
                        Reference<span aria-hidden="true">&rarr;</span>
                    </span>
                </VPLink>
            </div>

            <ul :class="plannedClass">
                <li
                    v-for="item in packages.planned"
                    :key="item.name"
                    class="flex flex-col gap-2 bg-paper p-5"
                >
                    <span class="flex items-center justify-between gap-3">
                        <code class="min-w-0 truncate font-mono text-sm text-ink">{{ item.name }}</code>
                        <span class="ch-chip shrink-0">planned {{ item.milestone }}</span>
                    </span>
                    <span class="text-sm leading-relaxed text-muted">{{ item.body }}</span>
                </li>
            </ul>

            <p class="m-0 mt-8">
                <VPLink
                    class="ch-link"
                    :href="packages.link.link"
                >
                    {{ packages.link.text }}<span aria-hidden="true">&rarr;</span>
                </VPLink>
            </p>
        </div>
    </section>
</template>
