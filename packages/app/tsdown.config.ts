import { defineConfig } from 'tsdown';

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        authup: 'src/authup/index.ts',
        testing: 'src/testing/index.ts',
    },
    format: 'esm',
    dts: true,
    sourcemap: true,
});
