/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { RunStatus } from '@chamberu/core';
import type { Run } from '@chamberu/core';

/** The step index a `Last-Event-ID` header names; -1 for none or garbage. */
export function parseLastEventId(header: string | null): number {
    if (header === null || !/^\d+$/.test(header)) return -1;
    const value = Number(header);
    return Number.isSafeInteger(value) ? value : -1;
}

const SETTLED = new Set<string>([RunStatus.COMPLETED, RunStatus.FAILED, RunStatus.CANCELLED]);

export function isSettled(run: Run): boolean {
    return SETTLED.has(run.status);
}

/** True when `run` differs from the last one sent: a later `updatedAt` or another status. */
export function isNewer(run: Run, last: Run | undefined): boolean {
    if (!last) return true;
    return run.updatedAt.getTime() > last.updatedAt.getTime() || run.status !== last.status;
}
