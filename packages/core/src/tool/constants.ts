/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { StandardSchemaV1 } from '@standard-schema/spec';
import { isObject } from 'smob';
import type { ToolContext } from './types.ts';

/** Why a chamvi tool got no ToolContext (internal; the run fails with it). */
export const TOOL_CONTEXT_MISSING = 'No chamvi tool context: ' +
    'the tool was built by another copy of @chamvi/core, or runs outside a chamvi agent.';

/**
 * The `contextSchema` of every chamvi tool: the engine hands the run's
 * ToolContext only to tools carrying this very object. `validate` returns the
 * context by identity (never cloned) and rejects a missing one, which fails
 * the run with a message naming the cause.
 */
export const toolContextSchema: StandardSchemaV1<ToolContext, ToolContext> = {
    '~standard': {
        version: 1,
        vendor: 'chamvi',
        validate: (value) => (isObject(value) ?
            { value: value as ToolContext } :
            { issues: [{ message: TOOL_CONTEXT_MISSING }] }),
    },
};
