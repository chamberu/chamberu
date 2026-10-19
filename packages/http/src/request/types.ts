/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IFilter, ISort } from '@rapiq/core';

/** A rapiq query reduced to what chamberu routes support; internal. */
export type DecodedQuery = {
    /** Top-level leaves, joined with `and`. */
    filters: IFilter[];
    limit?: number;
    offset?: number;
    sorts: ISort[];
};
