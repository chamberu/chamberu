/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { TriggerDefinition } from '../types.ts';
import type { HttpTriggerOptions } from './types.ts';

/**
 * The control-plane trigger: REST `POST /agents/:name/runs`, the UI and the
 * MCP tool `run_<agent>` start runs through it (envelope `trigger: 'http'`,
 * `source: 'http'` or `'mcp'`). Its id is `http`, so an agent declares it at
 * most once (enforced by the duplicate trigger id check of `defineAgent`).
 */
export function http(opts: HttpTriggerOptions = {}): TriggerDefinition {
    return {
        source: 'http',
        id: 'http',
        options: { schema: opts.schema },
    };
}
