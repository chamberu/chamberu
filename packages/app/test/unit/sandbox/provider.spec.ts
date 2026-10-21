/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ISandboxProvider, IWorkspace } from '@chamvi/sandbox';
import { describe, expect, it } from 'vitest';
import { createLazyProvider } from '../../../src/sandbox/provider.ts';

function inner(): ISandboxProvider & { creates: number } {
    const provider = {
        name: 'inner',
        creates: 0,
        async create() {
            provider.creates += 1;
            return { id: `ws-${provider.creates}` } as unknown as IWorkspace;
        },
        async collectGarbage() {
            return 3;
        },
    };
    return provider;
}

describe('createLazyProvider', () => {
    it('has the given name before loading', () => {
        const provider = createLazyProvider('k8s', async () => inner());
        expect(provider.name).toBe('k8s');
    });

    it('loads once, concurrent creates share it', async () => {
        let loads = 0;
        const target = inner();
        const provider = createLazyProvider('local', async () => {
            loads += 1;
            await new Promise<void>((resolve) => { setImmediate(resolve); });
            return target;
        });

        const [a, b] = await Promise.all([
            provider.create({ runId: 'r1' }),
            provider.create({ runId: 'r2' }),
        ]);
        await provider.load();
        expect(loads).toBe(1);
        expect(target.creates).toBe(2);
        expect([a.id, b.id].sort()).toEqual(['ws-1', 'ws-2']);
        expect(await provider.collectGarbage()).toBe(3);
        expect(loads).toBe(1);
    });

    it('a failed load is not cached', async () => {
        let loads = 0;
        const provider = createLazyProvider('local', async () => {
            loads += 1;
            if (loads === 1) {
                throw new Error('boom');
            }
            return inner();
        });

        await expect(provider.load()).rejects.toThrow('boom');
        await provider.load();
        expect(loads).toBe(2);
    });
});
