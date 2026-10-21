import { fileURLToPath } from 'node:url';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    plugins: [
        swc.vite({
            jsc: {
                parser: {
                    syntax: 'typescript',
                    decorators: true,
                },
                transform: {
                    legacyDecorator: true,
                    decoratorMetadata: false,
                },
            },
        }),
    ],
    resolve: {
        // the sources, not dist
        alias: [
            { find: /^@chamvi\/core$/, replacement: fileURLToPath(new URL('../../core/src/index.ts', import.meta.url)) },
            { find: /^@chamvi\/http$/, replacement: fileURLToPath(new URL('../../http/src/index.ts', import.meta.url)) },
            { find: /^@chamvi\/scheduler$/, replacement: fileURLToPath(new URL('../../scheduler/src/index.ts', import.meta.url)) },
            { find: /^@chamvi\/store-typeorm$/, replacement: fileURLToPath(new URL('../../store-typeorm/src/index.ts', import.meta.url)) },
            { find: /^@chamvi\/test-kit$/, replacement: fileURLToPath(new URL('../../test-kit/src/index.ts', import.meta.url)) },
            { find: /^@chamvi\/github$/, replacement: fileURLToPath(new URL('../../github/src/index.ts', import.meta.url)) },
            { find: /^@chamvi\/notify-github$/, replacement: fileURLToPath(new URL('../../notify-github/src/index.ts', import.meta.url)) },
            { find: /^@chamvi\/notify-openclaw$/, replacement: fileURLToPath(new URL('../../notify-openclaw/src/index.ts', import.meta.url)) },
            { find: /^@chamvi\/sandbox$/, replacement: fileURLToPath(new URL('../../sandbox/src/index.ts', import.meta.url)) },
            { find: /^@chamvi\/sandbox-local$/, replacement: fileURLToPath(new URL('../../sandbox-local/src/index.ts', import.meta.url)) },
            { find: /^@chamvi\/sandbox-docker$/, replacement: fileURLToPath(new URL('../../sandbox-docker/src/index.ts', import.meta.url)) },
            { find: /^@chamvi\/sandbox-k8s$/, replacement: fileURLToPath(new URL('../../sandbox-k8s/src/index.ts', import.meta.url)) },
            { find: /^@chamvi\/ui$/, replacement: fileURLToPath(new URL('../../ui/src/index.ts', import.meta.url)) },
            { find: /^@chamvi\/app$/, replacement: fileURLToPath(new URL('../src/index.ts', import.meta.url)) },
            { find: /^@chamvi\/app\/(github|sandbox|openclaw|ui|authup)$/, replacement: `${fileURLToPath(new URL('../src/', import.meta.url))}$1/index.ts` },
        ],
    },
    test: {
        globalSetup: ['test/global-setup.ts'],
        include: ['test/unit/**/*.{test,spec}.{js,ts}'],
        passWithNoTests: false,
        testTimeout: 30_000,
        hookTimeout: 60_000,
        coverage: {
            provider: 'v8',
            include: ['src/**/*.{ts,tsx,js,jsx}'],
            thresholds: {
                branches: 80,
                functions: 80,
                lines: 80,
                statements: 80,
            },
        },
    },
});
