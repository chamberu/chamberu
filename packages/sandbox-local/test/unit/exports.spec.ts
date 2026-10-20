/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import * as local from '@chamberu/sandbox-local';

describe('public api', () => {
    it('exports createLocalSandbox only', () => {
        expect(Object.keys(local).sort()).toEqual(['createLocalSandbox']);
        expect(local.createLocalSandbox).toBeTypeOf('function');
    });

    it('names the provider local', () => {
        expect(local.createLocalSandbox().name).toBe('local');
    });
});
