/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { parseRunListQuery } from '../../../src/runs/helpers.ts';

const parse = (query: string) => parseRunListQuery(new URLSearchParams(query));

describe('parseRunListQuery', () => {
    it('defaults the page', () => {
        expect(parse('')).toEqual({ limit: 50, offset: 0 });
    });

    it('reads agent, status and the page', () => {
        expect(parse('filter[agent]=echo&filter[status]=queued,running&page[limit]=5&page[offset]=2&sort=createdAt')).toEqual({
            agent: 'echo',
            status: ['queued', 'running'],
            limit: 5,
            offset: 2,
        });
        expect(parse('filter[status]=queued').status).toEqual(['queued']);
    });

    it.each([
        ['filter[status]=nope', 'filter[status] takes run statuses.'],
        ['filter[status]=!queued', 'filter[status] takes run statuses.'],
        ['filter[agent]=a,b', 'filter[agent] takes one agent name.'],
        ['filter[agent]=a&filter[agent]=b', 'filter[agent] takes one agent name.'],
        ['filter[agent]=~a', 'filter[agent] takes one agent name.'],
        ['filter=and(eq(agent,\'a\'),eq(agent,\'b\'))', 'filter[agent] may be given once.'],
        ['sort=-createdAt', 'Only sort=createdAt is supported.'],
    ])('rejects %s', (query, message) => {
        expect(() => parse(query)).toThrow(message);
    });

    it.each([
        'filter[status]=',
        'page[limit]=500',
        'page[limit]=abc',
        'filter[nope]=1',
        'sort=id',
    ])('rejects %s', (query) => {
        expect(() => parse(query)).toThrow();
    });
});
