/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { TriggerDefinition } from '../types.ts';
import type { HttpTriggerOptions } from './types.ts';

export function http(opts: HttpTriggerOptions = {}): TriggerDefinition {
    const path = opts.path ?? '/';
    return {
        source: 'http',
        id: `http:${path}`,
        options: { path, schema: opts.schema },
    };
}
