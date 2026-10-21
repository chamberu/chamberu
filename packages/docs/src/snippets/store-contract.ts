// #region contract
// test/unit/store.spec.ts
import { MemoryStore } from '@chamvi/core';
import { describeStoreContract } from '@chamvi/test-kit';

describeStoreContract((clock) => new MemoryStore({ clock }));
// #endregion contract
