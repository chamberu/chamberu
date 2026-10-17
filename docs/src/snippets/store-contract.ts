// #region contract
// test/unit/store.spec.ts
import { MemoryStore } from '@chamberu/core';
import { describeStoreContract } from '@chamberu/test-kit';

describeStoreContract((clock) => new MemoryStore({ clock }));
// #endregion contract
