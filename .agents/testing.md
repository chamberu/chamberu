# Testing

## Setup

- **Runner**: Vitest (`vitest --config test/vitest.config.ts --run`), per package.
- **Location**: `packages/<name>/test/unit/<module>/*.spec.ts`, mirroring `src/` (e.g. `engine/lifecycle.spec.ts`); shared helpers in `packages/<name>/test/utils/`.
- **Coverage**: `npm run test:coverage` (v8, thresholds 80% for branches, functions, lines, statements).

```bash
npm run test                                       # all packages via nx
npx nx run @chamberu/core:test                     # one package (or @chamberu/test-kit)
cd packages/core && npx vitest --config test/vitest.config.ts --run test/unit/engine/dispatch.spec.ts   # one file
cd packages/core && npx vitest --config test/vitest.config.ts   # watch mode
```

Only `test/unit/**/*.{test,spec}.{js,ts}` is picked up; a new test directory needs the `include` glob widened. CI runs `npm run test`, not `test:coverage`, so the coverage thresholds do not gate merges.

## Conventions

- Tests import the public API by package name (`@chamberu/core`, `@chamberu/test-kit`); each `vitest.config.ts` aliases them to the packages' `src/index.ts`, so tests run against sources, not `dist`. Internals (e.g. `src/effect/helpers.ts`, `src/store/index.ts`) are imported by relative path.
- Assert the expected behaviour from the module contract, not what the implementation happens to do; a failing test may be a real bug.
- Use `MemoryStore` and `mockModel(responses)` (`test/utils/mock-model.ts`, scripted `MockResponse`s per model call) instead of mocking internals. Prefer fakes over `vi.mock()`.
- Time goes through the injectable `IClock`: pass a `ControllableClock` to the engine and store and advance it, never real timers. Core's tests take it from `test/utils/clock.ts`; every other package takes it from `@chamberu/test-kit`.
- Every store implementation runs `describeStoreContract()` from `@chamberu/test-kit` (the `MemoryStore` run lives in `packages/test-kit/test/unit/memory-store.spec.ts`).
- `test/unit/smoke.spec.ts` checks that the package entry resolves.
- `test/unit/exports.spec.ts` pins the public exports; `test/unit/readme.spec.ts` runs `test/fixtures/readme-example.ts` and checks that `packages/core/README.md` contains that file verbatim. Change the example in the fixture, then copy it into the README.
