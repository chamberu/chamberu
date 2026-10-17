/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSource } from 'typeorm';
import { afterAll, beforeAll } from 'vitest';
import { describeStoreContract } from '@chamberu/test-kit';
import { TypeormStore } from '@chamberu/store-typeorm';
import { createTestDataSource, describePostgres, truncateStore } from '../../utils/database.ts';

describePostgres('postgres', () => {
    let dataSource: DataSource;

    beforeAll(async () => {
        dataSource = await createTestDataSource();
    });

    afterAll(async () => {
        await dataSource.destroy();
    });

    describeStoreContract(async (clock) => {
        await truncateStore(dataSource);
        return new TypeormStore({ dataSource, clock });
    });
});
