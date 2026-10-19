/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import * as http from '@chamberu/http';

describe('public api', () => {
    it.each([
        'agentPermission',
        'authup',
        'createHttpApp',
        'hasPermission',
        'staticTokens',
    ])('exports %s', (name) => {
        expect(http).toHaveProperty(name);
        expect(http[name as keyof typeof http]).toBeTypeOf('function');
    });

    it('exports Permission', () => {
        expect(http.Permission).toEqual({
            ALL: '*',
            RUN_READ: 'run:read',
            RUN_CANCEL: 'run:cancel',
            STATE_READ: 'state:read',
            STATE_WRITE: 'state:write',
        });
    });
});
