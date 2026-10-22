/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Tool, ToolExecutionOptions } from 'ai';
import type { StateSchema } from '../state/types.ts';
import type { ToolContext } from '../tool/types.ts';
import type { EFFECT, EFFECT_HOOKS } from './constants.ts';

export type EffectHooks = {
    effectKey?: (input: any, ctx: ToolContext, options: ToolExecutionOptions<any>) => string;
    alreadyApplied?: (effectKey: string, input: any, ctx: ToolContext) => Promise<any>;
};

export type EffectTool<I, O, S extends StateSchema = StateSchema> = Tool<I, O, ToolContext<S>> & {
    [EFFECT]: true;
    [EFFECT_HOOKS]: EffectHooks;
};

/** The tool call an execute runs for (internal): approve() and emit() read it. */
export type ToolCallFrame = {
    runId: string;
    toolCallId: string;
    toolName: string;
    /** How many approve() calls this tool call made so far. */
    approvals: number;
};
