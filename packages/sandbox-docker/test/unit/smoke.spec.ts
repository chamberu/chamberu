/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import * as docker from '@chamberu/sandbox-docker';

describe('package entry', () => {
    it('resolves', () => {
        expect(docker).toBeDefined();
        expect(docker.DEFAULT_NETWORK).toBe('bridge');
    });
});
