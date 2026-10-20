/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import * as docker from '@chamberu/sandbox-docker';

describe('public api', () => {
    it('exports the constants', () => {
        expect(Object.keys(docker).sort()).toEqual([
            'CONTAINER_NAME_PREFIX',
            'DEFAULT_NETWORK',
            'SANDBOX_USER',
        ]);
        expect(docker.DEFAULT_NETWORK).toBe('bridge');
        expect(docker.CONTAINER_NAME_PREFIX).toBe('chamberu-ws-');
        expect(docker.SANDBOX_USER).toBe('1000:1000');
    });

    it('keeps the container builder internal', () => {
        expect(docker).not.toHaveProperty('buildContainerOptions');
    });
});
