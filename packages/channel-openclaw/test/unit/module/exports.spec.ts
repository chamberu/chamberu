/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import * as module from '@chamvi/channel-openclaw/module';

describe('@chamvi/channel-openclaw/module', () => {
    it('exports openclawModule', () => {
        expect(module.openclawModule).toBeTypeOf('function');
        expect(module.OpenclawModule).toBeTypeOf('function');
    });

    it.each([
        'ERROR_PREFIX',
        'VARIABLES',
        'readDelivery',
    ])('keeps %s internal', (name) => {
        expect(module).not.toHaveProperty(name);
    });
});
