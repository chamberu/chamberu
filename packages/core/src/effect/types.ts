/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Tool } from 'ai';
import type { StateSchema } from '../state/types.ts';
import type { ToolContext } from '../tool/types.ts';
import type { EFFECT, EFFECT_HOOKS } from './constants.ts';

export type EffectHooks = {
    effectKey?: (input: any, ctx: ToolContext) => string;
    alreadyApplied?: (effectKey: string, input: any, ctx: ToolContext) => Promise<any>;
};

export type EffectTool<I, O, S extends StateSchema = StateSchema> = Tool<I, O, ToolContext<S>> & {
    [EFFECT]: true;
    [EFFECT_HOOKS]: EffectHooks;
};
