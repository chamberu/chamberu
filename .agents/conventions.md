# Conventions

## Tooling

| Tool | Purpose |
|------|---------|
| ESLint 10 (`@tada5hi/eslint-config`) | Linting (`npm run lint`, `npm run lint:fix`) |
| TypeScript 6 (`@tada5hi/tsconfig`) | Typecheck (`npm run typecheck`) |
| tsdown | Build to `dist/index.mjs` + `dist/index.d.mts` |
| nx | Runs `build`, `test`, `typecheck` across packages |
| commitlint + husky | Conventional Commits enforcement |
| release-please | Per-package versions and changelogs |

## Code Style

- ESM only (`"type": "module"`), Node >= 22.
- 4-space indent, LF, UTF-8, final newline (see `.editorconfig`).
- Single quotes, semicolons (enforced by ESLint).
- Package scope `@chamberu/*`, MIT license, all packages public.

## Workflow

- After changes run `npm run build && npm run test && npm run typecheck && npm run lint`.
- New package: add `packages/<name>` (copy `packages/core` layout), a path alias in the root `tsconfig.json`, an alias in its `test/vitest.config.ts`, and an entry in `release-please-config.json` and `.release-please-manifest.json`.
- Errors extend `ChamberuError` (ebec).

## Commits

Conventional Commits: `<type>(scope): <description>`, e.g. `feat(core): add run engine`. No AI-attribution trailers.

## CI/CD

- `ci.yml`: install, lint, build, typecheck, test on Node 22 and 24.
- `release.yml`: release-please on `master`; when a release is created, build and publish to npm with provenance.
