/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import * as scheduler from '@chamberu/scheduler';

describe('public api', () => {
    it.each([
        'createStoreScheduleLock',
    ])('exports %s', (name) => {
        expect(scheduler).toHaveProperty(name);
        expect(scheduler[name as keyof typeof scheduler]).toBeTypeOf('function');
    });
});
