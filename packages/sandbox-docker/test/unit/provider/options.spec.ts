/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { 
    describe, 
    expect, 
    it, 
    vi, 
} from 'vitest';
import { InvalidAgentDefinitionError, SandboxError } from '@chamberu/core';
import { createDockerSandbox } from '@chamberu/sandbox-docker';

describe('docker sandbox options', () => {
    it('is named docker and connects lazily', () => {
        expect(createDockerSandbox().name).toBe('docker');
    });

    it.each([
        ['an empty image', { image: '' }],
        ['an empty network', { network: '' }],
        ['an unknown pull policy', { pull: 'sometimes' }],
        ['a bad env key', { env: { 'A-B': 'x' } }],
        ['bad limits', { limits: { pids: 0 } }],
        ['a docker client without the API', { docker: {} }],
        ['a docker client without pull or modem', {
            docker: {
                createContainer() {},
                getContainer() {},
                listContainers() {},
            },
        }],
    ])('refuses %s', (_name, options) => {
        expect(() => createDockerSandbox(options as never)).toThrow(InvalidAgentDefinitionError);
    });
});

function fakeDocker(createError: unknown) {
    return {
        createContainer: vi.fn(async () => { throw createError; }),
        getContainer: vi.fn(),
        listContainers: vi.fn(async () => []),
        pull: vi.fn(async () => { throw new Error('pull must not run'); }),
        modem: {
            demuxStream: vi.fn(),
            followProgress: vi.fn(),
        },
    };
}

describe('docker sandbox create without a daemon', () => {
    it('does not pull for a 404 that names no missing image', async () => {
        const docker = fakeDocker(Object.assign(new Error('not found'), {
            statusCode: 404,
            json: { message: 'network chamberu-missing not found' },
        }));
        const provider = createDockerSandbox({ docker: docker as never });

        await expect(provider.create({ runId: 'run-1' })).rejects.toThrow(SandboxError);
        expect(docker.pull).not.toHaveBeenCalled();
        expect(docker.createContainer).toHaveBeenCalledTimes(1);
    });

    it('creates no container for an already aborted signal', async () => {
        const docker = fakeDocker(new Error('create must not run'));
        const provider = createDockerSandbox({ docker: docker as never, pull: 'always' });

        await expect(provider.create({ runId: 'run-1', signal: AbortSignal.abort() }))
            .rejects.toThrow('workspace creation aborted');
        expect(docker.pull).not.toHaveBeenCalled();
        expect(docker.createContainer).not.toHaveBeenCalled();
    });
});
