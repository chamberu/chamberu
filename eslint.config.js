import config from '@tada5hi/eslint-config';

export default [
    ...await config(),
    { ignores: ['**/dist/**', '**/coverage/**', '**/.vitepress/cache/**'] },
    {
        // documentation samples: they log, and show values as bare expressions
        files: ['packages/docs/src/snippets/**/*.ts'],
        rules: {
            'no-console': 'off',
            '@typescript-eslint/no-unused-expressions': 'off',
        },
    },
];
