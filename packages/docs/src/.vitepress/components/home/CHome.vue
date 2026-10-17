<!--
  - Copyright (c) 2026.
  - Author Peter Placzek (tada5hi)
  - For the full copyright and license information,
  - view the LICENSE file that was distributed with this source code.
  -->
<script lang="ts">
import { defineComponent } from 'vue';
import CHomeCta from './CHomeCta.vue';
import CHomeFeatures from './CHomeFeatures.vue';
import CHomeFlow from './CHomeFlow.vue';
import CHomeHero from './CHomeHero.vue';
import CHomePackages from './CHomePackages.vue';

// The landing page: a thin composition of independent sections. The `code`
// slot carries the hero's code sample, rendered by VitePress from a snippet.
export default defineComponent({
    name: 'CHome',
    components: {
        CHomeCta,
        CHomeFeatures,
        CHomeFlow,
        CHomeHero,
        CHomePackages,
    },
});
</script>
<template>
    <div class="vp-raw bg-paper font-sans text-ink">
        <CHomeHero>
            <template #code>
                <slot name="code" />
            </template>
        </CHomeHero>
        <CHomeFeatures />
        <CHomeFlow />
        <CHomePackages />
        <CHomeCta />
    </div>
</template>
