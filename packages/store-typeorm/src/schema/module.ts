/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSource } from 'typeorm';
import { withDatabaseLock } from 'typeorm-extension';
import { MIGRATION_LOCK_NAME } from './constants.ts';

/**
 * Run the store's migrations, serialized across processes by an advisory lock.
 *
 * The data source must list STORE_ENTITIES and STORE_MIGRATIONS.
 */
export async function migrateStore(dataSource: DataSource): Promise<void> {
    const queryRunner = dataSource.createQueryRunner();
    try {
        await withDatabaseLock(
            queryRunner,
            MIGRATION_LOCK_NAME,
            () => dataSource.runMigrations({ transaction: 'each' }),
        );
    } finally {
        await queryRunner.release();
    }
}
