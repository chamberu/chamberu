import type { ToolSet } from 'ai';
import type { RunContext } from '../run/types.ts';
import type { EffectStore } from '../store/types.ts';
import { EFFECT, EFFECT_HOOKS, stableHash } from './define.ts';
import type { EffectHooks } from './define.ts';

type Execute = (input: unknown, options: any) => unknown;

/**
 * Wraps every effect tool so it applies at most once per effect key:
 * stored result, then remote reconciliation, then execute. Other tools pass through.
 * A throwing execute (or alreadyApplied) records nothing, so a retry can still apply.
 */
export function wrapToolsForRun(tools: ToolSet, ctx: RunContext, store: EffectStore): ToolSet {
    const inflight = new Map<string, Promise<unknown>>();
    const wrapped: ToolSet = {};

    for (const [name, def] of Object.entries(tools)) {
        const hooks = (def as { [EFFECT_HOOKS]?: EffectHooks })[EFFECT_HOOKS];
        const execute = def.execute as Execute | undefined;
        if (!(EFFECT in def) || !execute) {
            wrapped[name] = def;
            continue;
        }

        const apply = async (key: string, input: unknown, options: unknown) => {
            const stored = await store.getEffect(key);
            if (stored) return stored.result;

            const remote = await hooks?.alreadyApplied?.(key, input, ctx);
            if (remote !== undefined) {
                await store.putEffect(key, remote);
                return remote;
            }

            // streaming tools yield; the effect's result is the last value
            let result: unknown = await execute.call(def, input, options);
            if (result !== null && typeof result === 'object' && Symbol.asyncIterator in result) {
                let last: unknown;
                for await (const chunk of result as AsyncIterable<unknown>) last = chunk;
                result = last;
            }
            // The effect already happened: a failing write must not fail the call.
            // `alreadyApplied` is what guards this window on a later retry.
            try {
                await store.putEffect(key, result);
            } catch (error) {
                // eslint-disable-next-line no-console
                console.error(`chamberu: failed to record effect ${key}`, error);
            }
            return result;
        };

        wrapped[name] = {
            ...def,
            execute: async (input: unknown, options: unknown) => {
                const key = hooks?.effectKey ?
                    hooks.effectKey(input, ctx) :
                    `${ctx.runId}:${name}:${stableHash(input)}`;
                // parallel identical calls within a step share one application
                let pending = inflight.get(key);
                if (!pending) {
                    pending = apply(key, input, options).finally(() => inflight.delete(key));
                    inflight.set(key, pending);
                }
                return pending;
            },
        } as ToolSet[string];
    }
    return wrapped;
}
