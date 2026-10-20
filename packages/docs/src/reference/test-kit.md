# @chamberu/test-kit

Test helpers for chamberu: a controllable clock and the store contract suite.

```bash
npm install --save-dev @chamberu/test-kit @chamberu/core vitest
```

`@chamberu/core` and `vitest` are peer dependencies.

## describeStoreContract

```ts
function describeStoreContract(
    create: (clock: ControllableClock) => IStore | Promise<IStore>,
): void;
```

Registers the Vitest suite every `IStore` implementation must pass. `create` is called once per test with a fresh `ControllableClock` and must return a fresh, empty store that uses that clock for every expiry decision.

<<< @/snippets/store-contract.ts#contract

See [Writing a Store](/stores/writing-a-store) for what the suite covers.

## ControllableClock

```ts
class ControllableClock implements IClock {
    constructor(start?: Date); // default new Date(0)
    now(): Date;
    setTimeout(fn: () => void, ms: number): { clear(): void };
    advance(ms: number): void;
}
```

Time moves only through `advance(ms)`, which fires every timer due within the window in order, including timers scheduled by fired callbacks. The `keepAlive` timer option has no meaning without a real event loop and is ignored.

<<< @/snippets/testing.ts#clock

Pass the same clock to the store and to the engine (`new Engine({ ..., clock })`) to test claim leases, run timeouts and approval expiry without real timers.
