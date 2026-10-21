/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import * as ui from '@chamvi/ui';

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
});
