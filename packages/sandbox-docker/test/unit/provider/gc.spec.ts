/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomUUID } from 'node:crypto';
import Docker from 'dockerode';
import {
    afterAll,
    expect,
    it,
} from 'vitest';
import { systemClock } from '@chamberu/core';
import type { IWorkspace } from '@chamberu/sandbox';
import { CONTAINER_NAME_PREFIX, createDockerSandbox } from '@chamberu/sandbox-docker';
import { ControllableClock } from '@chamberu/test-kit';
import { describeDocker, dockerImage } from '../../utils/docker.ts';

/**
 * Controllable `now` (the expiry), real timers: the transport polls the
 * exec state on `clock.setTimeout`, which a manual clock would never fire.
 */
class ExpiryClock extends ControllableClock {
    override setTimeout(fn: () => void, ms: number): { clear(): void } {
        return systemClock.setTimeout(fn, ms);
    }
}

function statusCode(error: unknown): number | undefined {
    return (error as { statusCode?: number } | undefined)?.statusCode;
}

describeDocker('docker garbage collection', () => {
    const docker = new Docker();
    const workspaces: IWorkspace[] = [];
    const strangers: Docker.Container[] = [];

    afterAll(async () => {
        await Promise.all([
            ...workspaces.map((workspace) => workspace.dispose().catch(() => undefined)),
            ...strangers.map((container) => container.remove({ force: true, v: true }).catch(() => undefined)),
        ]);
    });

    it('removes expired workspaces only', async () => {
        // an hour back, so no workspace of a spec running alongside is expired at this clock's time
        const clock = new ExpiryClock(new Date(Date.now() - 3_600_000));
        const provider = createDockerSandbox({
            image: dockerImage, 
            clock, 
            limits: { timeoutMs: 600_000 }, 
        });

        const first = await provider.create({ runId: `test-${randomUUID()}` });
        workspaces.push(first);
        clock.advance(60_000);
        const second = await provider.create({ runId: `test-${randomUUID()}` });
        workspaces.push(second);

        // past the first one's expiry, a minute before the second one's
        clock.advance(540_000);
        expect(await provider.collectGarbage()).toBe(1);

        await expect(docker.getContainer(`${CONTAINER_NAME_PREFIX}${first.id}`).inspect())
            .rejects.toSatisfy((error) => statusCode(error) === 404);
        const info = await docker.getContainer(`${CONTAINER_NAME_PREFIX}${second.id}`).inspect();
        expect(info.State.Running).toBe(true);
    });

    it('never touches containers without the managed-by label', async () => {
        const container = await docker.createContainer({
            Image: dockerImage,
            Cmd: ['sleep', '60'],
            Labels: {
                'app.kubernetes.io/component': 'sandbox',
                'chamberu.dev/run': `test-${randomUUID()}`,
                'chamberu.dev/expires-at': '0',
            },
        });
        strangers.push(container);

        const provider = createDockerSandbox({ image: dockerImage, clock: new ExpiryClock(new Date(Date.now() - 3_600_000)) });
        await provider.collectGarbage();

        await expect(container.inspect()).resolves.toBeDefined();
    });
});
