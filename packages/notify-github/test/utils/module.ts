/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock } from '@chamvi/core';
import { createLogger } from '@chamvi/app';
import type { ILogger } from '@chamvi/app';

export const SECRET = 'x'.repeat(32);

export type LogEntry = {
    level: string;
    msg: string;
    [key: string]: unknown;
};

export type RecordingLogger = ILogger & {
    entries: LogEntry[];
    /** The raw JSON lines, to check that a value never reached the log. */
    lines: string[];
};

/** The app's JSON line logger at `debug`, its lines kept in memory. */
export function createRecordingLogger(clock?: IClock): RecordingLogger {
    const lines: string[] = [];
    const entries: LogEntry[] = [];
    const logger = createLogger({
        level: 'debug',
        clock,
        write: (line) => {
            lines.push(line);
            entries.push(JSON.parse(line) as LogEntry);
        },
    });

    return Object.assign(logger, { entries, lines });
}
