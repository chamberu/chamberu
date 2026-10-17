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

export default defineComponent({
    name: 'CHomeCta',
    components: { VPLink },
    setup() {
        return { cta: useHome('cta') };
    },
});
</script>
<template>
    <section class="ch-section ch-section-alt border-t border-line">
        <div class="ch-wrap grid grid-cols-1 items-center gap-10 md:grid-cols-[minmax(0,1fr)_auto]">
            <div>
                <h2 class="ch-heading">
                    {{ cta.title }}
                </h2>
                <p class="ch-lede">
                    {{ cta.lead }}
                </p>
                <p class="ch-code m-0 mt-6 flex w-fit max-w-full items-baseline gap-3 overflow-x-auto px-4 py-3 font-mono text-sm">
                    <span
                        class="text-night-muted"
                        aria-hidden="true"
                    >$</span>
                    <code class="whitespace-nowrap">{{ cta.command }}</code>
                </p>
            </div>
            <div class="flex flex-wrap gap-3">
                <VPLink
                    v-for="action in cta.actions"
                    :key="action.link"
                    :href="action.link"
                    :class="['ch-button', action.theme === 'alt' ? 'ch-button-secondary' : 'ch-button-primary']"
                >
                    {{ action.text }}
                </VPLink>
            </div>
        </div>
    </section>
</template>
