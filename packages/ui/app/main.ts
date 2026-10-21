/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import installButton from '@vuecs/button';
import vuecs from '@vuecs/core';
import installCountdown from '@vuecs/countdown';
import installElements from '@vuecs/elements';
import installForms from '@vuecs/forms';
import installIcon from '@vuecs/icon';
import lucide from '@vuecs/icons-lucide';
import installOverlays from '@vuecs/overlays';
import installPagination from '@vuecs/pagination';
import installPlaceholder from '@vuecs/placeholder';
import installTable from '@vuecs/table';
import tailwind from '@vuecs/theme-tailwind';
import installTimeago from '@vuecs/timeago';
import { createApp } from 'vue';
import App from './App.vue';
import { readConfig } from './config/module.ts';
import { createUiRouter } from './router/module.ts';
import './style.css';

const config = readConfig(document);
const app = createApp(App);

app.use(vuecs, { themes: [tailwind()], icons: [lucide()] });
for (const plugin of [
    installIcon,
    installButton,
    installCountdown,
    installElements,
    installForms,
    installOverlays,
    installPagination,
    installPlaceholder,
    installTable,
    installTimeago,
]) app.use(plugin);

app.use(createUiRouter(config));
app.mount('#app');
