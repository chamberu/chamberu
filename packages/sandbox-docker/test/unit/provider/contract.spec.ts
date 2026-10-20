/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomUUID } from 'node:crypto';
import { createDockerSandbox } from '@chamberu/sandbox-docker';
import { describeWorkspaceContract } from '@chamberu/test-kit';
import { describeDocker, dockerImage } from '../../utils/docker.ts';

describeDocker('docker sandbox', () => {
    describeWorkspaceContract('docker', () => createDockerSandbox({ image: dockerImage })
        .create({ runId: `test-${randomUUID()}` }));
});
