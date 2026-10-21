import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// the dev server proxies the API to a chamvi app on port 3000
const API = 'http://127.0.0.1:3000';

export default defineConfig(({ command }) => ({
    root: 'app',
    base: command === 'build' ? './' : '/ui/',
    plugins: [vue(), tailwindcss()],
    build: {
        outDir: '../dist/app',
        emptyOutDir: true,
        assetsDir: 'assets',
    },
    server: { proxy: Object.fromEntries(['/agents', '/runs', '/resume', '/schedules', '/me'].map((path) => [path, API])) },
}));
