import { defineConfig } from 'tsdown';

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        github: 'src/github/index.ts',
        sandbox: 'src/sandbox/index.ts',
    },
    format: 'esm',
    dts: true,
    sourcemap: true,
});
