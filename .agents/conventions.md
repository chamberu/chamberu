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
| unplugin-swc | Compiles the store-typeorm entities' legacy decorators in tsdown and Vitest; the root `tsconfig.build.json` sets `experimentalDecorators: true` |

The `@tada5hi/*` config packages are the source of truth for lint, TS and commit rules; the local config files are thin wrappers. Prefer changing the shared package over adding a local override, unless the deviation is chamberu-specific.

## Code Style

- ESM only (`"type": "module"`), Node >= 22.
- 4-space indent (also JSON and YAML), LF, UTF-8, final newline, trailing whitespace trimmed except in Markdown (see `.editorconfig`).
- Single quotes, semicolons (enforced by ESLint).
- Package scope `@chamberu/*`, Apache-2.0 license (`LICENSE` plus `NOTICE` in the root and every package), all packages public.

## File Organization

- **Every file under `src/` and `test/` starts with the copyright header** (config files such as `tsdown.config.ts` and `test/vitest.config.ts` do not; neither does `test/fixtures/readme-example.ts`, which the README embeds verbatim):

  ```ts
  /*
   * Copyright (c) <year>.
   * Author Peter Placzek (tada5hi)
   * For the full copyright and license information,
   * view the LICENSE file that was distributed with this source code.
   */
  ```
- **A module is a folder, not a file.** A concept gets `src/<concept>/` with, as needed:
  - `module.ts`: the implementation (the class or the main functions). A folder with several implementations names them after what they do (`effect/define.ts`, `effect/wrap.ts`), and a sub-concept with its own content gets a subfolder (`engine/queue/`, `engine/execute/`).
  - `types.ts`: every exported type. No exported type lives in an implementation file.
  - `helpers.ts`: functions the implementation uses. When helpers grow, it becomes a `helpers/` folder with one file per helper and its own `index.ts`.
  - `constants.ts`: every exported constant (`agent/constants.ts`, `effect/constants.ts`, `errors/constants.ts`).
  - `index.ts`: the barrel. It re-exports **files of its own folder only**, alphabetically: `export *` when the whole file is public, named exports when the folder keeps part of it internal (`effect/index.ts` exports `EFFECT` but not `EFFECT_HOOKS`; helpers are never exported).
- **One class per file.** `max-classes-per-file` is `1` in `@tada5hi/eslint-config`; never disable it in source. Sibling classes share a folder: `src/errors/base.ts` holds `ChamberuError`, and every other error has its own file named after its concept, kebab-case and without an `-error` suffix (`lease-lost.ts` holds `LeaseLostError`). Error codes live in `ErrorCode` (`errors/constants.ts`), never as string literals in the constructors.
- **No cross-module re-export files.** A file that just pulls symbols out of other modules is not allowed; the code moves into the folder (or package) it belongs to.
- **The package entry composes folder barrels.** `src/index.ts` is `export * from './<folder>/index.ts'` per folder. Inside a package, import the file you need (`../errors/index.ts`, `../state/types.ts`), not `src/index.ts`.
- **Test helpers are a package.** Helpers other packages test with (`ControllableClock`, `describeStoreContract`) live in `@chamberu/test-kit`, which depends on `@chamberu/core`; core never depends on the kit (that would be an nx cycle), so core's own tests use the private copy in `test/utils/clock.ts`.

## Naming

- **`interface` is for behavior contracts and always carries the `I` prefix**: `IStore`, `IRunStore`, `IClock`, `INotifier`, `IAgentState`. A class implements it (`MemoryStore implements IStore`), or a factory returns it.
- **Data shapes are `type` aliases without a prefix**: `Run`, `Step`, `TriggerEnvelope`, `RunEngineOptions`, `ResumeTokenClaims`.
- Files are kebab-case.

## Helpers and Dependencies

- Object checks use `isObject` from `smob`, never `typeof x === 'object' && x !== null` (note that `isObject` is false for arrays).
- Standard Schema validation goes through validup (`buildIssuesForStandardSchemaIssues` from `@validup/standard-schema`); errors carry ebec `issues`, never a custom issue field.
- Packages that answer HTTP (`@chamberu/http`) throw `@ebec/http` errors (`BadRequestError`, `ForbiddenError`, ...) and define no error classes of their own; core errors pass through and the error handler maps them by `code`.
- Option misconfiguration in any package's factory (`createHttpApp`, `createScheduler`, `staticTokens`, ...) throws core `InvalidAgentDefinitionError`: it covers app definitions, not only agents.
- validup has no built-in validators: build them with `defineValidator`, fail with `createValidupError` (an ebec issue code, never a bare `Error`) and reuse them (`packages/http/src/request/validators.ts`), never pull in zod for request validation (zod stays a dev dependency for specs).
- Persistence code uses TypeORM repositories and their query builders (`insert().orIgnore()`, `orUpdate()` with an overwrite condition, `update().where().returning()`, find options). Raw SQL only where the ORM cannot express a statement, with a one-line comment saying why.

## Workflow

- After changes run `npm run build && npm run test && npm run typecheck && npm run lint`. Run `npm run lint:fix` before hand-fixing formatting.
- Never edit `dist/` (generated, git-ignored). Never hand-edit `.release-please-manifest.json` or package versions; release-please owns them.
- Keep runtime `dependencies` minimal (the house libraries `@ebec/core`, `smob`, `validup` are fine); tooling belongs in `devDependencies`, and the AI SDK (`ai`) stays a peer dependency.
- New package: add `packages/<name>` (copy `packages/test-kit` layout), a path alias in the root `tsconfig.json`, aliases in its `test/vitest.config.ts` for itself and every workspace package it imports, and an entry in `release-please-config.json` and `.release-please-manifest.json`.
- Errors extend `ChamberuError` (`@ebec/core` `BaseError`) and live in `src/errors/`, one file each (see File Organization); never throw a bare `Error` from library code.
- A new public export goes through its folder's `index.ts` (reached from `src/index.ts`) and must be added to the package's `test/unit/exports.spec.ts`.

## Planning and Delivery

- Plans and specs stay local (gitignored): the design spec and research notes in `docs/superpowers/specs/`, plans in `.agents/plans/` with `000-roadmap.md` as the living index (open work only, next free plan number at the top). A finished plan is deleted; its outcome moves into `.agents/architecture.md` or `.agents/design.md`.
- Before building, turn the next plan into TDD tasks (superpowers `writing-plans`), then execute subagent-driven in a git worktree under `/opt/projects/chamberu/worktrees/<name>`; keep `master` checked out in the main clone.
- For larger work, orchestrate with workflows: Opus implementers, Fable reviewers, a per-task review and fix loop, and an adversarial whole-branch review with one fix wave before merge.
- Every change lands through a pull request with a Conventional Commit title and an evidence-based body (what changed, what was run). The repo squash-merges with the PR title as the commit message and deletes merged branches.
- Ask before pushing to `master`, publishing to npm or merging release PRs. Settle visual choices (brand, layouts) with rendered previews before implementing.
- Keep status updates short; lead with the result and the decisions taken on the owner's behalf.

## Commits

Conventional Commits: `<type>(scope): <description>`, e.g. `feat(core): add run engine`. No AI-attribution trailers. release-please derives versions and changelogs from them.

- Pre-1.0 (`bump-minor-pre-major` and `bump-patch-for-minor-pre-major`): `fix:` and `feat:` bump the patch, a breaking change (`!` or `BREAKING CHANGE:`) bumps the minor.
- `build:`, `chore:`, `ci:`, `docs:`, `style:`, `refactor:`, `test:` do not release.
- Dependency bumps match Dependabot: `fix(deps): ...` for production, `build(deps-dev): ...` for dev dependencies.

## CI/CD

- `ci.yml`: on push and PR to `master`, install, lint, build, typecheck, test on Node 22 and 24.
- `release.yml`: release-please on `master` opens a release PR per package (`node-workspace` plugin, tags like `core-v0.1.0`); when merged, build and publish via `tada5hi/monoship@v2` with npm provenance.
- Both reuse the composite actions in `.github/actions/{install,build}`; change Node setup or caching there.
