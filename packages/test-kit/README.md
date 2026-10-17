<p align="center">
    <img src="https://raw.githubusercontent.com/chamberu/chamberu/master/.github/assets/logo-test-kit.svg" alt="@chamberu/test-kit" width="128" height="128" />
</p>

<h1 align="center">@chamberu/test-kit</h1>

<p align="center">
    <b>Test helpers for chamberu: a controllable clock and the store contract suite.</b>
</p>

<p align="center">
    <a href="https://www.npmjs.com/package/@chamberu/test-kit"><img src="https://img.shields.io/npm/v/@chamberu/test-kit" alt="npm version" /></a>
    <a href="https://github.com/chamberu/chamberu/actions/workflows/ci.yml"><img src="https://github.com/chamberu/chamberu/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="https://github.com/chamberu/chamberu/blob/master/packages/test-kit/LICENSE"><img src="https://img.shields.io/npm/l/@chamberu/test-kit" alt="License" /></a>
</p>

---

## Installation

```bash
npm install --save-dev @chamberu/test-kit @chamberu/core vitest
```

`@chamberu/core` and `vitest` are peer dependencies.

## Usage

### Store contract

Every `IStore` implementation proves itself with the shared Vitest suite. The factory gets a fresh `ControllableClock` per test and must use it for every expiry decision:

```typescript
import { MemoryStore } from '@chamberu/core';
import { describeStoreContract } from '@chamberu/test-kit';

describeStoreContract((clock) => new MemoryStore({ clock }));
```

### Controllable clock

`ControllableClock` implements `IClock` and only moves when told to, so engine timeouts, claim leases and approval expiry are tested without real timers:

```typescript
import { MemoryStore, RunEngine } from '@chamberu/core';
import { ControllableClock } from '@chamberu/test-kit';

const clock = new ControllableClock();
const store = new MemoryStore({ clock });
const engine = new RunEngine({ store, agents: [], resumeSecret: 'secret', clock });

clock.advance(60_000); // fires every timer due within the next minute, in order
```

## API

| Export | Kind | Purpose |
|---|---|---|
| `ControllableClock` | class | `IClock` that advances only via `advance(ms)`; starts at `new Date(0)` unless given a date |
| `describeStoreContract` | function | Vitest suite every `IStore` implementation must pass |

## License

Made with 💚

Published under [Apache License 2.0](./LICENSE).
