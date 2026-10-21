/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import * as scheduler from '@chamvi/scheduler';

describe('public api', () => {
    it.each([
        'createScheduler',
        'createStoreScheduleLock',
        'fireCronTrigger',
        'readCronOptions',
        'runJob',
    ])('exports %s', (name) => {
        expect(scheduler).toHaveProperty(name);
        expect(scheduler[name as keyof typeof scheduler]).toBeTypeOf('function');
    });

    it('exports SCHEDULE_LOCK_TTL_MS', () => {
        expect(scheduler.SCHEDULE_LOCK_TTL_MS).toBe(600_000);
    });
});
