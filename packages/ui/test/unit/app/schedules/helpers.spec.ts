/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { describeCron } from '../../../../app/schedules/helpers.ts';

describe('describeCron', () => {
    it('reads the common shapes', () => {
        expect(describeCron('0 8 * * 1-5')).toBe('weekdays 08:00');
        expect(describeCron('30 7 * * *')).toBe('daily 07:30');
        expect(describeCron('0 10 * * 0,6')).toBe('weekends 10:00');
        expect(describeCron('5 9 * * 1')).toBe('Mondays 09:05');
        expect(describeCron('5 9 * * 7')).toBe('Sundays 09:05');
        expect(describeCron('0 * * * *')).toBe('hourly');
        expect(describeCron('15 * * * *')).toBe('hourly at :15');
        expect(describeCron('*/15 * * * *')).toBe('every 15 min');
        expect(describeCron('* * * * *')).toBe('every minute');
        expect(describeCron(' 0  8 * *  1-5 ')).toBe('weekdays 08:00');
    });

    it('is undefined for anything else', () => {
        for (const expression of ['0 8 1 * *', '0 8 * 1 *', '0 8,12 * * *', '0 24 * * *', '61 8 * * *', '0 8 * * 1-3', '0 0 8 * * *', '@daily', '15 * * * 1']) {
            expect(describeCron(expression), expression).toBeUndefined();
        }
    });
});
