/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import * as core from '@chamberu/core';

describe('public api', () => {
    it.each([
        'defineAgent',
        'cron',
        'http',
        'manual',
        'RunEngine',
        'MemoryStore',
        'defineEffectTool',
        'effectMarker',
        'createResumeToken',
        'verifyResumeToken',
        'ChamberuError',
        'InvalidResumeTokenError',
        'BudgetExceededError',
    ])('exports %s', (name) => {
        expect(core).toHaveProperty(name);
        expect(core[name as keyof typeof core]).toBeTypeOf('function');
    });
});
