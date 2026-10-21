import type { ISandboxProvider } from '@chamvi/sandbox';
import { createDockerSandbox } from '@chamvi/sandbox-docker';

export function createSandbox(): ISandboxProvider {
    // DOCKER_HOST or /var/run/docker.sock; nothing connects before the first create()
    return createDockerSandbox({
        network: 'bridge',
        limits: { memory: '1Gi' },
    });
}
