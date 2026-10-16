# Testing

## Setup

- **Runner**: Vitest (`vitest --config test/vitest.config.ts --run`), per package.
- **Location**: `packages/<name>/test/unit/**/*.spec.ts`; shared helpers in `packages/<name>/test/utils/`.
- **Coverage**: `npm run test:coverage` (v8, thresholds 80% for branches, functions, lines, statements).

```bash
npm run test                                       # all packages via nx
npx nx run @chamberu/core:test                     # one package
```

## Conventions

- Tests import the package by name (`@chamberu/core`); `vitest.config.ts` aliases it to `src/index.ts`, so tests run against sources, not `dist`.
- Use `MemoryStore` and a mock model (`test/utils/mock-model.ts`) instead of mocking internals. Prefer fakes over `vi.mock()`.
- Time goes through the injectable `Clock`, never real timers.
- Every store implementation runs `describeStoreContract()` from `@chamberu/core/testing`.
- `test/unit/smoke.spec.ts` checks that the package entry resolves.
