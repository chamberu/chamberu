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
        'createShutdown',
        'oidc',
        'staticTokens',
    ])('exports %s', (name) => {
        expect(http).toHaveProperty(name);
        expect(http[name as keyof typeof http]).toBeTypeOf('function');
    });

    it('leaves permission matching to core', () => {
        // core's hasPermission(principal.permissions, wanted) is the one matcher
        expect(http).not.toHaveProperty('hasPermission');
    });

    it('exports the shutdown defaults', () => {
        expect(http.DEFAULT_SHUTDOWN_DRAIN_TIMEOUT_MS).toBe(30_000);
        expect(http.DEFAULT_SHUTDOWN_CLOSE_TIMEOUT_MS).toBe(5_000);
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
