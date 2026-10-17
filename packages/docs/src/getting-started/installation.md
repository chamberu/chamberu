# Installation

```bash
npm install @chamberu/core ai
```

- **Runtime:** Node.js 22 or newer. The package is ESM only.
- **AI SDK:** `ai@^7` (the Vercel AI SDK) is a peer dependency. Install the provider package of your model as well, for example `@ai-sdk/anthropic` or `@ai-sdk/openai`.
- **Schemas:** tool input schemas are whatever the AI SDK accepts. The examples in these docs use [zod](https://zod.dev). State collections take any [Standard Schema](https://standardschema.dev).

```bash
npm install @ai-sdk/anthropic zod
```

## Testing helpers

`@chamberu/test-kit` exports the store contract suite and a controllable clock. `@chamberu/core` and `vitest` are its peer dependencies:

```bash
npm install --save-dev @chamberu/test-kit vitest
```

See [Writing a Store](/stores/writing-a-store) and the [test-kit reference](/reference/test-kit).

## Packages

| Package | Status |
|---|---|
| `@chamberu/core` | Shipped (0.x) |
| `@chamberu/test-kit` | Shipped (0.x), test helpers |
| `@chamberu/store-typeorm`, `@chamberu/scheduler`, `@chamberu/http`, `@chamberu/github`, notifiers, sandboxes, `@chamberu/ui`, `chamberu` (CLI) | <Badge type="warning" text="Planned" /> See the [roadmap](/roadmap) |

chamberu is pre-1.0: a minor version may contain breaking changes, including changes to the store schema.
