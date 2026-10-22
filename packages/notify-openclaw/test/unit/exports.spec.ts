/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import * as pkg from '@chamvi/notify-openclaw';
import * as module from '@chamvi/notify-openclaw/module';

describe('public api', () => {
    it('exports openclaw', () => {
        expect(pkg.openclaw).toBeTypeOf('function');
    });

    it.each([
        'injectOpenclawContext',
        'provideOpenclawContext',
    ])('exports %s', (name) => {
        expect(pkg[name as keyof typeof pkg]).toBeTypeOf('function');
    });

    it('exports the constants', () => {
        expect(pkg.DEFAULT_HOOKS_PATH).toBe('/hooks');
        expect(pkg.OPENCLAW_TIMEOUT_MS).toBe(30_000);
        expect(pkg.OPENCLAW_REQUEST_ERROR_CODE).toBe('openclaw_request');
        expect(pkg.MESSAGE_BODY_MAX_LENGTH).toBe(8_000);
    });

    it.each([
        'HOOK_NAME',
        'IDEMPOTENCY_KEY_MAX_LENGTH',
        'DEFAULT_NOTIFIER_NAME',
        'ERROR_TEXT_MAX_LENGTH',
        'resolveOptions',
        'openclawContextKey',
        'renderMessage',
    ])('keeps %s internal', (name) => {
        expect(pkg).not.toHaveProperty(name);
    });

    it('@chamvi/notify-openclaw/module exports openclawModule', () => {
        expect(module.openclawModule).toBeTypeOf('function');
        expect(module.OpenclawModule).toBeTypeOf('function');
    });

    it.each([
        'ERROR_PREFIX',
        'VARIABLES',
        'readDelivery',
    ])('@chamvi/notify-openclaw/module keeps %s internal', (name) => {
        expect(module).not.toHaveProperty(name);
    });

    it.each([
        'openclawModule',
        'OpenclawModule',
    ])('the main entry keeps %s out', (name) => {
        expect(pkg).not.toHaveProperty(name);
    });
});
