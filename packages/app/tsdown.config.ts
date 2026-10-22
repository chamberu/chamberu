import { defineConfig } from 'tsdown';

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        github: 'src/github/index.ts',
        sandbox: 'src/sandbox/index.ts',
        openclaw: 'src/openclaw/index.ts',
        ui: 'src/ui/index.ts',
        authup: 'src/authup/index.ts',
        testing: 'src/testing/index.ts',
    },
    format: 'esm',
    dts: true,
    sourcemap: true,
});
