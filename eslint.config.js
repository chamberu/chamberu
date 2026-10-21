import config from '@tada5hi/eslint-config';

export default [
    ...await config({ vue: true }),
    {
        ignores: [
            '**/dist/**',
            '**/coverage/**',
            '**/.vitepress/cache/**',
            'packages/ui/test-results/**',
            'packages/ui/playwright-report/**',
        ],
    },
    {
        // documentation samples: they log, and show values as bare expressions
        files: ['packages/docs/src/snippets/**/*.ts'],
        rules: {
            'no-console': 'off',
            '@typescript-eslint/no-unused-expressions': 'off',
        },
    },
];
