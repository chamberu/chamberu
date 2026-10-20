import type { ISandboxProvider } from '@chamberu/sandbox';
import { createDockerSandbox } from '@chamberu/sandbox-docker';

export function createSandbox(): ISandboxProvider {
    // DOCKER_HOST or /var/run/docker.sock; nothing connects before the first create()
    return createDockerSandbox({
        network: 'bridge',
        limits: { memory: '1Gi' },
    });
}
