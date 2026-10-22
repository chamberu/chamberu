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
import { runToolCall } from './frame.ts';
import { stableHash, validateToolInput } from './helpers.ts';
import type { EffectHooks, WrapToolsOptions } from './types.ts';

type Execute = (input: unknown, options: any) => unknown;

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
    return isObject(value) && Symbol.asyncIterator in value;
}

function isAsyncGeneratorFunction(fn: unknown): boolean {
    return Object.prototype.toString.call(fn) === '[object AsyncGeneratorFunction]';
}

/** The last value a streaming tool yields: its final output. */
async function lastOf(iterable: AsyncIterable<unknown>): Promise<unknown> {
    let last: unknown;
    for await (const chunk of iterable) last = chunk;
    return last;
}

function toolCallIdOf(options: unknown): string {
    return String((options as { toolCallId?: unknown } | undefined)?.toolCallId ?? '');
}

/**
 * Wraps every executable tool for one execution. Per call, in this order:
 * the tool-call frame (`runToolCall`, so emit() and approve() know the call
 * they belong to), the `allow` re-check (a refused call throws
 * ToolNotAllowedError, a tool error), the agent's `beforeToolExecution` hook
 * (a changed input is re-parsed by the tool's input schema), then for an
 * effect tool the at-most-once application per effect key (stored result,
 * then remote reconciliation, then execute; the key is computed from the
 * final input), then `afterToolExecution` (on a fresh and a recorded result
 * alike, never for a tool error). The effect hooks get `ctx`, the execution's
 * ToolContext; wrapped tools keep every field (`contextSchema` included) and
 * forward the call options unchanged. A throwing execute (or alreadyApplied)
 * records nothing, so a retry can still apply. Tools without `execute` pass
 * through untouched.
 */
export function wrapToolsForRun(
    tools: ToolSet,
    ctx: ToolContext,
    store: IEffectStore,
    options: WrapToolsOptions = {},
): ToolSet {
    const { allow, hooks = {} } = options;
    const inflight = new Map<string, Promise<unknown>>();
    const wrapped: ToolSet = {};

    for (const [name, def] of Object.entries(tools)) {
        const effectHooks = (def as { [EFFECT_HOOKS]?: EffectHooks })[EFFECT_HOOKS];
        const execute = def.execute as Execute | undefined;
        if (!execute) {
            wrapped[name] = def;
            continue;
        }
        const inFrame = (callOptions: unknown, fn: () => unknown) => runToolCall({
            runId: ctx.run.runId,
            toolCallId: toolCallIdOf(callOptions),
            toolName: name,
            approvals: 0,
        }, fn);
        const check = () => {
            if (allow && !allow(name)) throw new ToolNotAllowedError(name);
        };
        const before = async (input: unknown, callOptions: unknown): Promise<unknown> => {
            if (!hooks.beforeToolExecution) return input;
            const next = await hooks.beforeToolExecution({
                toolName: name,
                toolCallId: toolCallIdOf(callOptions),
                input,
            }, ctx);
            if (next === undefined || next === input) return input;
            return validateToolInput(name, def.inputSchema, next);
        };
        const after = async (input: unknown, output: unknown, callOptions: unknown): Promise<unknown> => {
            if (!hooks.afterToolExecution) return output;
            const next = await hooks.afterToolExecution({
                toolName: name,
                toolCallId: toolCallIdOf(callOptions),
                input,
                output,
            }, ctx);
            return next === undefined ? output : next;
        };

        if (!(EFFECT in def)) {
            if (!hooks.beforeToolExecution && !hooks.afterToolExecution) {
                wrapped[name] = {
                    ...def,
                    execute: (input: unknown, callOptions: unknown) => inFrame(callOptions, () => {
                        check();
                        return execute.call(def, input, callOptions);
                    }),
                } as ToolSet[string];
                continue;
            }
            if (isAsyncGeneratorFunction(execute)) {
                // still streaming: every value but the last passes through, the
                // last one (the final output) goes through afterToolExecution
                wrapped[name] = {
                    ...def,
                    execute: (input: unknown, callOptions: unknown) => inFrame(callOptions, async function* streamed() {
                        check();
                        const final = await before(input, callOptions);
                        const iterable = execute.call(def, final, callOptions) as AsyncIterable<unknown>;
                        if (!hooks.afterToolExecution) {
                            yield* iterable;
                            return;
                        }
                        let held = false;
                        let last: unknown;
                        for await (const chunk of iterable) {
                            if (held) yield last;
                            last = chunk;
                            held = true;
                        }
                        yield await after(final, last, callOptions);
                    }),
                } as ToolSet[string];
                continue;
            }
            wrapped[name] = {
                ...def,
                execute: (input: unknown, callOptions: unknown) => inFrame(callOptions, async () => {
                    check();
                    const final = await before(input, callOptions);
                    let result: unknown = await execute.call(def, final, callOptions);
                    // a streaming result of a plain function: its final value
                    if (isAsyncIterable(result)) result = await lastOf(result);
                    return after(final, result, callOptions);
                }),
            } as ToolSet[string];
            continue;
        }

        const apply = async (key: string, input: unknown, callOptions: unknown) => {
            const stored = await store.getEffect(key);
            if (stored) return stored.result;

            const remote = await effectHooks?.alreadyApplied?.(key, input, ctx);
            if (remote !== undefined) {
                await store.putEffect(key, remote);
                return remote;
            }

            // streaming tools yield; the effect's result is the last value
            let result: unknown = await execute.call(def, input, callOptions);
            if (isAsyncIterable(result)) result = await lastOf(result);
            // The effect already happened: a failing write must not fail the call.
            // `alreadyApplied` is what guards this window on a later retry.
            try {
                await store.putEffect(key, result);
            } catch (error) {
                // eslint-disable-next-line no-console
                console.error(`chamvi: failed to record effect ${key}`, error);
            }
            return result;
        };

        wrapped[name] = {
            ...def,
            execute: (input: unknown, callOptions: unknown) => inFrame(callOptions, async () => {
                check();
                const final = await before(input, callOptions);
                const key = effectHooks?.effectKey ?
                    effectHooks.effectKey(final, ctx, callOptions as ToolExecutionOptions<ToolContext>) :
                    `${ctx.run.runId}:${name}:${stableHash(final)}`;
                // parallel identical calls within a step share one application
                let pending = inflight.get(key);
                if (!pending) {
                    pending = apply(key, final, callOptions).finally(() => inflight.delete(key));
                    inflight.set(key, pending);
                }
                return after(final, await pending, callOptions);
            }),
        } as ToolSet[string];
    }
    return wrapped;
}
