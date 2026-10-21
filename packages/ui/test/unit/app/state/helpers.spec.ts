/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { docColumns, inlineJson } from '../../../../app/state/helpers.ts';

describe('state helpers', () => {
    it('renders one line of JSON', () => {
        expect(inlineJson('x')).toBe('"x"');
        expect(inlineJson({ a: [1] })).toBe('{"a":[1]}');
        expect(inlineJson(undefined)).toBe('undefined');
    });

    it('collects id and the first fields', () => {
        expect(docColumns([{ id: 'a', x: 1 }, {
            id: 'b',
            y: 2,
            x: 3,
        }])).toEqual(['id', 'x', 'y']);
        expect(docColumns([{
            id: 'a',
            a: 1,
            b: 1,
            c: 1,
        }], 2)).toEqual(['id', 'a', 'b']);
    });
});
