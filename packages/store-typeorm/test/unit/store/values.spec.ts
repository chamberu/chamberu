/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSource } from 'typeorm';
import {
    afterAll,
    beforeAll,
    beforeEach,
    expect,
    it,
} from 'vitest';
import type { Checkpoint } from '@chamberu/core';
import { ControllableClock } from '@chamberu/test-kit';
import { TypeormStore } from '@chamberu/store-typeorm';
import { createTestDataSource, describePostgres, truncateStore } from '../../utils/database.ts';

describePostgres('TypeormStore values', () => {
    let dataSource: DataSource;
    let store: TypeormStore;

    beforeAll(async () => {
        dataSource = await createTestDataSource();
    });

    beforeEach(async () => {
        await truncateStore(dataSource);
        store = new TypeormStore({ dataSource, clock: new ControllableClock(new Date(10_000)) });
    });

    afterAll(async () => {
        await dataSource.destroy();
    });

    it('jsonb values round-trip arrays, null and strings', async () => {
        await store.kvSet('a', 'arr', [1, 2]);
        await expect(store.kvGet('a', 'arr')).resolves.toEqual([1, 2]);
        await store.kvSet('a', 'n', null);
        await expect(store.kvGet('a', 'n')).resolves.toBeNull();
        await store.kvSet('a', 's', 'text');
        await expect(store.kvGet('a', 's')).resolves.toBe('text');
        await store.kvSet('a', 'arr', undefined);
        await expect(store.kvGet('a', 'arr')).resolves.toBeUndefined();

        await store.putEffect('e', [1]);
        await expect(store.getEffect('e')).resolves.toEqual({ result: [1] });
        await store.putEffect('u', undefined);
        await expect(store.getEffect('u')).resolves.toEqual({ result: null });
        await expect(store.getEffect('missing')).resolves.toBeUndefined();

        const step = {
            runId: 'r1',
            index: 0,
            kind: 'tool' as const,
            name: 'lookup',
            input: ['x'],
            output: 'done',
            startedAt: new Date(1_000),
            finishedAt: new Date(2_000),
        };
        await store.appendStep(step);
        const steps = await store.listSteps('r1');
        expect(steps).toEqual([step]);
        expect(Object.keys(steps[0]!)).not.toContain('error');

        await store.docUpsert('a', 'c', '1', [1]);
        await expect(store.docList('a', 'c')).resolves.toEqual([{ id: '1', doc: [1] }]);
        await store.docUpsert('a', 'c', 'n', null);
        await expect(store.docList('a', 'c')).resolves.toContainEqual({ id: 'n', doc: null });

        const cp: Checkpoint = {
            runId: 'r1',
            stepIndex: 1,
            messages: [
                {
                    role: 'assistant',
                    content: [{
                        type: 'tool-call',
                        toolCallId: 'c1',
                        toolName: 'lookup',
                        input: { q: 'x' },
                    }],
                },
            ],
            finishReason: 'tool-calls',
            createdAt: new Date(3_000),
        };
        await store.saveCheckpoint(cp);
        await expect(store.latestCheckpoint('r1')).resolves.toEqual(cp);
    });

    it('listSteps orders by index, then insertion', async () => {
        const at = new Date(1_000);
        for (const [index, name] of [[2, 'two'], [0, 'zero'], [1, 'one-a'], [1, 'one-b']] as const) {
            await store.appendStep({
                runId: 'r1',
                index,
                kind: 'llm',
                name,
                startedAt: at,
                finishedAt: at,
            });
        }
        const steps = await store.listSteps('r1');
        expect(steps.map((s) => s.name)).toEqual(['zero', 'one-a', 'one-b', 'two']);
    });
});
