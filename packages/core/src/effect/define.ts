import { createHash } from 'node:crypto';
import { tool } from 'ai';
import type { Tool } from 'ai';
import type { RunContext } from '../run/types.ts';

/** Marks a tool as a side-effecting tool that must apply at most once per run. */
export const EFFECT: unique symbol = Symbol.for('chamberu.effect');

/** Key under which the effectKey/alreadyApplied hooks hang off an effect tool. */
export const EFFECT_HOOKS: unique symbol = Symbol.for('chamberu.effect.hooks');

export interface EffectHooks {
    effectKey?: (input: any, ctx: RunContext) => string;
    alreadyApplied?: (effectKey: string, input: any, ctx: RunContext) => Promise<any>;
}

function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((v) => canonical(v));
    if (value !== null && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(value).sort()) {
            out[key] = canonical((value as Record<string, unknown>)[key]);
        }
        return out;
    }
    return value;
}

/** sha256 hex of the canonical JSON (recursively sorted keys; undefined dropped). */
export function stableHash(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(canonical(value)) ?? 'undefined').digest('hex');
}

/** Hidden marker tools embed in remote artifacts so `alreadyApplied` can find them again. */
export function effectMarker(effectKey: string): string {
    return `<!-- chamberu:effect=${effectKey} -->`;
}

export type EffectTool<I, O> = Tool<I, O> & {
    [EFFECT]: true;
    [EFFECT_HOOKS]: EffectHooks;
};

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
