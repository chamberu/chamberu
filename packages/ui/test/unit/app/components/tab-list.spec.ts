/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { tabForKey } from '../../../../app/components/tab-list/helpers.ts';

describe('tabForKey', () => {
    const tabs = ['overview', 'runs', 'state'] as const;

    it('moves with the arrow keys and wraps around', () => {
        expect(tabForKey(tabs, 'overview', 'ArrowRight')).toBe('runs');
        expect(tabForKey(tabs, 'state', 'ArrowRight')).toBe('overview');
        expect(tabForKey(tabs, 'overview', 'ArrowLeft')).toBe('state');
    });

    it('jumps to the ends and ignores other keys', () => {
        expect(tabForKey(tabs, 'runs', 'Home')).toBe('overview');
        expect(tabForKey(tabs, 'runs', 'End')).toBe('state');
        expect(tabForKey(tabs, 'runs', 'Enter')).toBeUndefined();
    });
});
