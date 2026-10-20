/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { V1Pod } from '@kubernetes/client-node';
import { describe, expect, it } from 'vitest';
import { SandboxError } from '@chamberu/core';
import { createKubernetesSandbox } from '@chamberu/sandbox-k8s';
import { ControllableClock } from '@chamberu/test-kit';
import { createFakePodClient } from '../../utils/client.ts';

const START = 1_000_000;

const managed = {
    'app.kubernetes.io/managed-by': 'chamberu',
    'app.kubernetes.io/component': 'sandbox',
};

function pod(name: string, expiresAt: number, phase: string, labels: Record<string, string> = managed): V1Pod {
    return {
        metadata: {
            name,
            labels: { ...labels, 'chamberu.dev/workspace': name },
            annotations: { 'chamberu.dev/expires-at': String(expiresAt) },
        },
        spec: { containers: [] },
        status: { phase },
    };
}

function setup() {
    const clock = new ControllableClock(new Date(START));
    const client = createFakePodClient();
    const provider = createKubernetesSandbox({
        namespace: 'agents',
        client,
        clock,
    });
    return {
        client,
        clock,
        provider,
    };
}

describe('kubernetes garbage collection', () => {
    it('deletes expired and finished pods', async () => {
        const { client, provider } = setup();
        for (const seeded of [
            pod('expired', START, 'Running'),
            pod('failed', START + 60_000, 'Failed'),
            pod('fresh', START + 60_000, 'Running'),
            pod('stranger', START - 60_000, 'Running', { 'app.kubernetes.io/managed-by': 'someone-else' }),
        ]) {
            client.pods.set(seeded.metadata!.name!, seeded);
        }

        await expect(provider.collectGarbage()).resolves.toBe(2);
        expect(client.deleted).toEqual(['expired', 'failed']);
        expect(client.selectors).toEqual(['app.kubernetes.io/managed-by=chamberu,app.kubernetes.io/component=sandbox']);
        expect(client.pods.keys().toArray()).toEqual(['fresh', 'stranger']);
    });

    it('disposes an expired workspace it created', async () => {
        const {
            client,
            clock,
            provider,
        } = setup();
        const first = await provider.create({ runId: 'r1', limits: { timeoutMs: 60_000 } });
        const second = await provider.create({ runId: 'r1', limits: { timeoutMs: 120_000 } });
        clock.advance(60_000);

        await expect(provider.collectGarbage()).resolves.toBe(1);
        expect(client.deleted).toEqual([`chamberu-ws-${first.id}`]);
        await expect(first.exec(['true'])).rejects.toThrow(/disposed/);
        await expect(second.exec(['true'])).resolves.toMatchObject({ exitCode: 0 });

        // a later dispose of the collected workspace deletes nothing more
        await first.dispose();
        expect(client.deleted).toHaveLength(1);
    });

    it('reports a failed list as SandboxError', async () => {
        const { client, provider } = setup();
        client.list = async () => {
            throw new Error('forbidden');
        };
        await expect(provider.collectGarbage()).rejects.toBeInstanceOf(SandboxError);
    });
});
