/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import * as ui from '@chamvi/ui';
import * as module from '@chamvi/ui/module';

describe('public api', () => {
    it('exports uiRoutes and the constants', () => {
        expect(Object.keys(ui).sort()).toEqual([
            'ASSET_CACHE_CONTROL',
            'CONFIG_ELEMENT_ID',
            'DEFAULT_UI_BASE_PATH',
            'DOCUMENT_CACHE_CONTROL',
            'uiRoutes',
        ]);
        expect(ui.CONFIG_ELEMENT_ID).toBe('chamvi-config');
        expect(ui.DEFAULT_UI_BASE_PATH).toBe('/ui');
        expect(ui.ASSET_CACHE_CONTROL).toBe('public, max-age=31536000, immutable');
        expect(ui.DOCUMENT_CACHE_CONTROL).toBe('no-cache');
    });

    it('@chamvi/ui/module exports uiModule', () => {
        expect(Object.keys(module).sort()).toEqual([
            'UI_MODULE_NAME',
            'UiModule',
            'uiModule',
        ]);
        expect(module.UI_MODULE_NAME).toBe('chamvi:ui');
    });

    it.each([
        'UI_MODULE_NAME',
        'UiModule',
        'uiModule',
    ])('the main entry keeps %s out', (name) => {
        expect(ui).not.toHaveProperty(name);
    });
});
