/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSource } from 'typeorm';
import { assertSchemaMatchesMetadata } from 'typeorm-extension';
import {
    afterEach,
    expect,
    it,
} from 'vitest';
import { migrateStore } from '@chamberu/store-typeorm';
import { TableName } from '../../../src/entities/constants.ts';
import { createTestDataSource, describePostgres } from '../../utils/database.ts';
import type { TestDataSourceOptions } from '../../utils/database.ts';

describePostgres('schema', () => {
    const dataSources: DataSource[] = [];

    const create = async (opts?: TestDataSourceOptions) => {
        const dataSource = await createTestDataSource(opts);
        dataSources.push(dataSource);
        return dataSource;
    };

    afterEach(async () => {
        await Promise.all(dataSources.map((ds) => ds.destroy()));
        dataSources.length = 0;
    });

    it('the migration creates the schema the entities describe', async () => {
        const ds = await create();
        await expect(assertSchemaMatchesMetadata(ds)).resolves.toBeUndefined();
    });

    it('creates the GIN index on docs', async () => {
        const ds = await create();
        const rows: { indexdef: string }[] = await ds.query(
            'SELECT indexdef FROM pg_indexes WHERE indexname = $1',
            ['IDX_chamberu_docs_doc_gin'],
        );
        expect(rows).toHaveLength(1);
        expect(rows[0]!.indexdef).toContain('USING gin');
    });

    it('migrateStore is safe to call concurrently and twice', async () => {
        const ds = await create({ migrate: false });
        await Promise.all([migrateStore(ds), migrateStore(ds)]);
        await migrateStore(ds);

        const [{ count }] = await ds.query(
            'SELECT count(*) FROM migrations WHERE name = $1',
            ['Init1792195200000'],
        );
        expect(count).toBe('1');

        const tables: { table_name: string }[] = await ds.query(
            'SELECT table_name FROM information_schema.tables WHERE table_name = ANY($1::text[])',
            [Object.values(TableName)],
        );
        expect(tables.map((t) => t.table_name).sort()).toEqual(Object.values(TableName).sort());
    });

    it('the migration reverts in a schema other than public', async () => {
        const ds = await create({ schema: 'other' });
        const tablesIn = async (schema: string) => {
            const rows: { table_name: string }[] = await ds.query(
                'SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name = ANY($2::text[])',
                [schema, Object.values(TableName)],
            );
            return rows.length;
        };
        expect(await tablesIn('other')).toBe(Object.values(TableName).length);
        expect(await tablesIn('public')).toBe(0);

        await ds.undoLastMigration({ transaction: 'each' });
        expect(await tablesIn('other')).toBe(0);
    });
});
