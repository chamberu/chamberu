/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { RunStatusLiteral } from '@chamberu/core';

/** Statuses a job returns on: the run finished or waits for a human. */
export const SETTLING: RunStatusLiteral[] = ['completed', 'failed', 'cancelled', 'waiting'];
