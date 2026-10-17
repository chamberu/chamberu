/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { tool } from 'ai';
import type { Tool } from 'ai';
import type { RunContext } from '../run/types.ts';
import { EFFECT, EFFECT_HOOKS } from './constants.ts';
import type { EffectHooks, EffectTool } from './types.ts';

/** Hidden marker tools embed in remote artifacts so `alreadyApplied` can find them again. */
export function effectMarker(effectKey: string): string {
    return `<!-- chamberu:effect=${effectKey} -->`;
}

export function defineEffectTool<I, O>(def: Tool<I, O> & {
    /** Default: `${runId}:${toolName}:${stableHash(input)}`. */
    effectKey?: (input: I, ctx: RunContext) => string;
    /** Remote reconciliation (e.g. find a comment by its hidden marker). */
    alreadyApplied?: (effectKey: string, input: I, ctx: RunContext) => Promise<O | undefined>;
}): EffectTool<I, O> {
    const {
        effectKey,
        alreadyApplied,
        ...rest
    } = def;
    const defined = tool(rest as Tool<I, O>) as Tool<I, O>;
    return Object.assign(defined, {
        [EFFECT]: true as const,
        [EFFECT_HOOKS]: {
            effectKey,
            alreadyApplied,
        } as EffectHooks,
    });
}
