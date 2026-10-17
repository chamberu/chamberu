/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Tool } from 'ai';
import type { RunContext } from '../run/types.ts';
import type { EFFECT, EFFECT_HOOKS } from './constants.ts';

export type EffectHooks = {
    effectKey?: (input: any, ctx: RunContext) => string;
    alreadyApplied?: (effectKey: string, input: any, ctx: RunContext) => Promise<any>;
};

export type EffectTool<I, O> = Tool<I, O> & {
    [EFFECT]: true;
    [EFFECT_HOOKS]: EffectHooks;
};
