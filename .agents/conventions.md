# Conventions

## Tooling

| Tool | Purpose |
|------|---------|
| ESLint 10 (`@tada5hi/eslint-config`) | Linting (`npm run lint`, `npm run lint:fix`) |
| TypeScript 6 (`@tada5hi/tsconfig`) | Typecheck (`npm run typecheck`) |
| tsdown | Build each entry (`index`, `testing`) to `dist/<entry>.mjs` + `.d.mts` |
| nx | Runs `build`, `test`, `typecheck` across packages |
| commitlint + husky | Conventional Commits enforcement (`.husky/commit-msg`) |
| release-please | Per-package versions and changelogs |
| Dependabot | Daily npm + GitHub Actions updates, grouped by prod/dev and major/minor+patch |
| EditorConfig | Whitespace rules shared with the editor |

The `@tada5hi/*` config packages are the source of truth for lint, TS and commit rules; the local config files are thin wrappers. Prefer changing the shared package over adding a local override, unless the deviation is chamberu-specific.

## Code Style

- ESM only (`"type": "module"`), Node >= 22.
- 4-space indent (also JSON and YAML), LF, UTF-8, final newline, trailing whitespace trimmed except in Markdown (see `.editorconfig`).
- Single quotes, semicolons (enforced by ESLint).
- Package scope `@chamberu/*`, MIT license, all packages public.

## File Organization

- **A module is a folder, not a file.** Once a concept has more than one kind of content (types, an implementation, helpers), it gets `src/<concept>/` with:
  - `module.ts`: the implementation (the class or the main functions).
  - `types.ts`: its exported interfaces and type aliases. Implementation files import from here; no exported type lives inline in `module.ts`.
  - `helpers.ts`: internal functions. When helpers grow, it becomes a `helpers/` folder with one file per helper and its own `index.ts`.
  - `constants.ts`: exported constants, if any.
  - `index.ts`: the barrel, `export * from './<file>'` for files of **this folder only**, in alphabetical order.
  
  Example: `src/clock/{module,types,index}.ts` (`Clock`, `ClockTimerOptions` in `types.ts`, `systemClock` in `module.ts`).
- **One class per file.** `max-classes-per-file` is `1` in `@tada5hi/eslint-config`; never disable it in source. Sibling classes share a folder instead, e.g. errors:
  - `src/errors/base.ts` holds `ChamberuError`; every other error has its own file named after its concept, kebab-case and without an `-error` suffix (`lease-lost.ts` holds `LeaseLostError`).
  - Error codes live in `src/errors/constants.ts`, not as string literals in the constructors.
- **No cross-module re-export files.** A barrel only re-exports its own folder. A file that just pulls symbols out of other modules (like the old `src/testing.ts`) is not allowed; the code it exposes moves into the folder it is the entry of. Test helpers shipped as `@chamberu/core/testing` live in `src/testing/` (e.g. `testing/clock.ts` for `ControllableClock`, `testing/store-contract.ts` for `describeStoreContract`), with `src/testing/index.ts` as the tsdown entry.
- **The package entry composes folder barrels.** `src/index.ts` re-exports `./<folder>/index.ts`; what a folder keeps internal, it leaves out of its own barrel.
- Not migrated yet: `errors.ts`, `clock.ts`, `testing.ts`, `store/contract.ts`, and the inline exported types in `engine/*.ts`, `effect/define.ts`, `state/api.ts`, `approval/token.ts`. Do not add to them; migrate a file when touching it.

## Workflow

- After changes run `npm run build && npm run test && npm run typecheck && npm run lint`. Run `npm run lint:fix` before hand-fixing formatting.
- Never edit `dist/` (generated, git-ignored). Never hand-edit `.release-please-manifest.json` or package versions; release-please owns them.
- Keep runtime `dependencies` minimal; tooling belongs in `devDependencies`, and the AI SDK (`ai`) stays a peer dependency.
- New package: add `packages/<name>` (copy `packages/core` layout), a path alias in the root `tsconfig.json`, an alias in its `test/vitest.config.ts`, and an entry in `release-please-config.json` and `.release-please-manifest.json`.
- Errors extend `ChamberuError` (`@ebec/core` `BaseError`) and live in `src/errors/`, one file each (see File Organization); never throw a bare `Error` from library code.
- A new public export goes through its folder's `index.ts` (reached from `src/index.ts`, or `src/testing/index.ts` for test helpers) and must be added to `test/unit/exports.spec.ts`.

## Commits

Conventional Commits: `<type>(scope): <description>`, e.g. `feat(core): add run engine`. No AI-attribution trailers. release-please derives versions and changelogs from them.

- Pre-1.0 (`bump-minor-pre-major` and `bump-patch-for-minor-pre-major`): `fix:` and `feat:` bump the patch, a breaking change (`!` or `BREAKING CHANGE:`) bumps the minor.
- `build:`, `chore:`, `ci:`, `docs:`, `style:`, `refactor:`, `test:` do not release.
- Dependency bumps match Dependabot: `fix(deps): ...` for production, `build(deps-dev): ...` for dev dependencies.

## CI/CD

- `ci.yml`: on push and PR to `master`, install, lint, build, typecheck, test on Node 22 and 24.
- `release.yml`: release-please on `master` opens a release PR per package (`node-workspace` plugin, tags like `core-v0.1.0`); when merged, build and publish via `tada5hi/monoship@v2` with npm provenance.
- Both reuse the composite actions in `.github/actions/{install,build}`; change Node setup or caching there.
