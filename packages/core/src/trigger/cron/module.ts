/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { CronExpressionParser } from 'cron-parser';
import { InvalidAgentDefinitionError } from '../../errors/index.ts';
import type { TriggerDefinition } from '../types.ts';
import type { CronOptions } from './types.ts';

export function cron(expression: string, opts: CronOptions = {}): TriggerDefinition {
    try {
        CronExpressionParser.parse(expression, opts.timezone ? { tz: opts.timezone } : {});
    } catch (e) {
        throw new InvalidAgentDefinitionError(
            `Invalid cron expression "${expression}": ${e instanceof Error ? e.message : String(e)}`,
        );
    }

    return {
        source: 'cron',
        id: `cron:${expression}`,
        options: {
            expression,
            timezone: opts.timezone,
            overlap: opts.overlap ?? 'skip',
            payload: opts.payload,
        },
    };
}
