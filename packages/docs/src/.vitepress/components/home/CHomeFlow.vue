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

const DIAGRAM_ALT = 'dispatch() stores a queued run. The engine claims it and runs it, with a checkpoint after every step, until it ends completed, failed or cancelled. A tool call that needs approval pauses the run in waiting with a signed resume token; resume() requeues it. drain() or a crash leaves a run interrupted; recover() requeues it, and the next execution continues from the latest checkpoint.';

export default defineComponent({
    name: 'CHomeFlow',
    components: { VPLink },
    setup() {
        return {
            flow: useHome('flow'),
            diagramAlt: DIAGRAM_ALT,
        };
    },
});
</script>
<template>
    <section class="ch-section ch-section-alt">
        <div class="ch-wrap">
            <div class="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
                <div>
                    <p class="ch-eyebrow">
                        {{ flow.eyebrow }}
                    </p>
                    <h2 class="ch-heading">
                        {{ flow.title }}
                    </h2>
                    <p class="ch-lede">
                        {{ flow.lead }}
                    </p>
                </div>
                <VPLink
                    class="ch-link shrink-0"
                    :href="flow.link.link"
                >
                    {{ flow.link.text }}<span aria-hidden="true">&rarr;</span>
                </VPLink>
            </div>

            <ul
                class="m-0 mt-10 flex list-none flex-wrap gap-2 p-0"
                aria-label="Run statuses"
            >
                <li
                    v-for="status in flow.statuses"
                    :key="status"
                    :class="['ch-chip', status === flow.active ? 'ch-chip-accent' : '']"
                >
                    {{ status }}
                </li>
            </ul>

            <figure class="ch-card m-0 mt-4 overflow-x-auto p-3 md:p-5">
                <img
                    class="only-light block h-auto w-full min-w-[640px]"
                    src="/run-lifecycle-light.svg"
                    width="960"
                    height="400"
                    :alt="diagramAlt"
                >
                <img
                    class="only-dark block h-auto w-full min-w-[640px]"
                    src="/run-lifecycle-dark.svg"
                    width="960"
                    height="400"
                    alt=""
                    aria-hidden="true"
                >
            </figure>
        </div>
    </section>
</template>
