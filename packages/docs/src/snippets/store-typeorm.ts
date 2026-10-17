import type { LanguageModel } from 'ai';
import { RunEngine, defineAgent } from '@chamberu/core';
import {
    STORE_ENTITIES,
    STORE_MIGRATIONS,
    TypeormStore,
    migrateStore,
} from '@chamberu/store-typeorm';
import { DataSource } from 'typeorm';

export async function createEngine(model: LanguageModel) {
    const triage = defineAgent({
        name: 'triage',
        model,
        instructions: 'Triage the issue.',
    });

    // #region setup
    const dataSource = new DataSource({
        type: 'postgres',
        url: process.env.DATABASE_URL,
        entities: STORE_ENTITIES,
        migrations: STORE_MIGRATIONS,
    });
    await dataSource.initialize();
    await migrateStore(dataSource);

    const store = new TypeormStore({ dataSource });
    const engine = new RunEngine({
        store,
        agents: [triage],
        resumeSecret: process.env.RESUME_SECRET!,
    });
    // #endregion setup

    // #region purge
    await store.purgeExpired();
    // #endregion purge

    return engine;
}
