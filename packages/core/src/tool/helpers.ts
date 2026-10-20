/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Tool } from 'ai';
import { toolContextSchema } from './constants.ts';

/** Whether the engine hands this tool the run's ToolContext (the marker is the schema reference). */
export function hasToolContext(tool: Tool): boolean {
    return tool.contextSchema === toolContextSchema;
}
