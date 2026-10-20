/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ToolExecutionOptions, ToolSet } from 'ai';
import { isObject } from 'smob';
import { ToolNotAllowedError } from '../errors/index.ts';
import type { IEffectStore } from '../store/types.ts';
import type { ToolContext } from '../tool/types.ts';
import { EFFECT, EFFECT_HOOKS } from './constants.ts';
import { stableHash } from './helpers.ts';
import type { EffectHooks } from './types.ts';

type Execute = (input: unknown, options: any) => unknown;

/**
 * Wraps every effect tool so it applies at most once per effect key:
 * stored result, then remote reconciliation, then execute. Other tools pass through.
 * The hooks get `ctx`, the execution's ToolContext; wrapped tools keep every
 * field (`contextSchema` included) and forward the call options unchanged.
 * A throwing execute (or alreadyApplied) records nothing, so a retry can still apply.
 * With \`allow\`, every call (effect tool or not) is re-checked first: a refused
 * call throws ToolNotAllowedError, which the AI SDK returns to the model as a
 * tool error.
 */
export function wrapToolsForRun(
    tools: ToolSet,
    ctx: ToolContext,
    store: IEffectStore,
    allow?: (toolName: string) => boolean,
): ToolSet {
    const inflight = new Map<string, Promise<unknown>>();
    const wrapped: ToolSet = {};

    for (const [name, def] of Object.entries(tools)) {
        const hooks = (def as { [EFFECT_HOOKS]?: EffectHooks })[EFFECT_HOOKS];
        const execute = def.execute as Execute | undefined;
        if (!execute) {
            wrapped[name] = def;
            continue;
        }
        if (!(EFFECT in def)) {
            wrapped[name] = allow ?
                {
                    ...def,
                    execute: (input: unknown, options: unknown) => {
                        if (!allow(name)) throw new ToolNotAllowedError(name);
                        return execute.call(def, input, options);
                    },
                } as ToolSet[string] :
                def;
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
            if (isObject(result) && Symbol.asyncIterator in result) {
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
                if (allow && !allow(name)) throw new ToolNotAllowedError(name);
                const key = hooks?.effectKey ?
                    hooks.effectKey(input, ctx, options as ToolExecutionOptions<ToolContext>) :
                    `${ctx.run.runId}:${name}:${stableHash(input)}`;
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
