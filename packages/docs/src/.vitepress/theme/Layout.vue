<!--
  - Copyright (c) 2026.
  - Author Peter Placzek (tada5hi)
  - For the full copyright and license information,
  - view the LICENSE file that was distributed with this source code.
  -->
<script lang="ts">
import DefaultTheme from 'vitepress/theme';
import { defineComponent } from 'vue';
import CFooter from '../components/layout/CFooter.vue';

// Thin wrapper: the default layout plus the site-wide footer. Keep Tailwind
// classes out of this file, `theme/` is not a Tailwind @source.
export default defineComponent({
    name: 'ChamviLayout',
    components: {
        DefaultLayout: DefaultTheme.Layout,
        CFooter,
    },
});
</script>
<template>
    <DefaultLayout>
        <template #layout-bottom>
            <CFooter />
        </template>
    </DefaultLayout>
</template>
