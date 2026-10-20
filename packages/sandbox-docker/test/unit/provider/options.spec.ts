/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { InvalidAgentDefinitionError } from '@chamberu/core';
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
    ])('refuses %s', (_name, options) => {
        expect(() => createDockerSandbox(options as never)).toThrow(InvalidAgentDefinitionError);
    });
});
