import { describeStoreContract } from '@chamberu/core/testing';
import { MemoryStore } from '../../../src/store/memory.ts';

describeStoreContract((clock) => new MemoryStore({ clock }));
