/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import * as pkg from '@chamvi/notify-github';

describe('public api', () => {
    it('exports githubNotifier', () => {
        expect(pkg.githubNotifier).toBeTypeOf('function');
    });

    it('exports the constants', () => {
        expect(pkg.GITHUB_NOTIFIER_TIMEOUT_MS).toBe(30_000);
        expect(pkg.COMMENT_BODY_MAX_LENGTH).toBe(60_000);
    });

    it.each([
        'LOGIN_PATTERN',
        'SAFE_KEY_PATTERN',
        'RECONCILE_SKEW_MS',
        'DEFAULT_NOTIFIER_NAME',
        'resolveOptions',
        'resolveTarget',
        'renderComment',
        'markerKey',
    ])('keeps %s internal', (name) => {
        expect(pkg).not.toHaveProperty(name);
    });
});
