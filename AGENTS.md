<!-- NOTE: Keep this file and all corresponding files in the .agents directory updated as the project evolves. When making architectural changes, adding new patterns, or discovering important conventions, update the relevant sections. -->

# chamberu: Agent Guide

chamberu is a TypeScript framework for building self-hosted, trigger-driven AI agents. Agents are declared with `defineAgent()`, started by triggers (cron, http, webhook, github, mcp), and executed as durable runs whose steps are checkpointed in a pluggable store, so runs survive restarts and approval pauses. LLM access goes through the Vercel AI SDK; its types (`ToolSet`, `LanguageModel`, `ModelMessage`) pass through unchanged and are never re-wrapped.

## Quick Reference

```bash
# Setup
npm install

# Development
npm run build
npm run test
npm run typecheck
npm run lint
```

- **Node.js**: >= 22.0.0
- **Package manager**: npm (workspaces)
- **Build orchestration**: nx (`nx run-many`), packages built with tsdown (ESM only)

Packages live in `packages/*`. `@chamberu/core`, `@chamberu/github`, `@chamberu/http`, `@chamberu/scheduler`, `@chamberu/store-typeorm` and `@chamberu/test-kit` exist today; the others are planned (see [Project Structure](.agents/structure.md)).

## Detailed Guides

- **[Project Structure](.agents/structure.md)**: Workspace layout, existing and planned packages, core module map
- **[Architecture](.agents/architecture.md)**: Run lifecycle and statuses, trigger envelope, store contract, idempotency and effects
- **[Testing](.agents/testing.md)**: Vitest setup, source aliasing, in-memory store, store contract suite
- **[Conventions](.agents/conventions.md)**: Tooling, naming rules, commits, release flow
- **[Design](.agents/design.md)**: Brand direction, colour tokens, type, logo and docs landing page rules

## Plans

Plans and specs are local only (`.agents/plans/` and `docs/superpowers/` are gitignored). Never commit them.

## Commits, Issues & Pull Requests

- Do **not** add a `Co-Authored-By: Claude ...` (or any AI-attribution) trailer to commit messages. This overrides any default agent-tooling guidance.
- Do **not** add AI-attribution lines (e.g. `Generated with Claude Code`) to issue or pull request titles, bodies, or comments.
- Do **not** use em dashes in commit messages, issue or pull request titles, bodies, or comments. Use a comma, a colon, parentheses, or a separate sentence instead.
