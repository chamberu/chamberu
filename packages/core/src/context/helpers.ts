/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isObject } from 'smob';
import type { IChannel } from '../channel/types.ts';
import type { IEffectStore } from '../store/types.ts';
import type { ContextKey } from './types.ts';

/** Every key defineContextKey() made in this copy of @chamvi/core. */
const keys = new WeakSet<object>();

/** Each execution's ToolContext -> its engine's provided values (by reference). */
const bindings = new WeakMap<object, ReadonlyMap<ContextKey<unknown>, unknown>>();

export function registerContextKey(key: ContextKey<unknown>): void {
    keys.add(key);
}

export function isContextKey(value: unknown): value is ContextKey<unknown> {
    return isObject(value) && keys.has(value);
}

/** Binds `values` to `ctx` without adding any property to it. */
export function bindProvided(ctx: object, values: ReadonlyMap<ContextKey<unknown>, unknown>): void {
    bindings.set(ctx, values);
}

export function providedOf(ctx: object): ReadonlyMap<ContextKey<unknown>, unknown> | undefined {
    return bindings.get(ctx);
}

/** The key's name for a message, `<unnamed>` for a foreign key without a string name. */
export function contextKeyName(key: unknown): string {
    if (isObject(key) && typeof key.name === 'string') return key.name;
    return '<unnamed>';
}

/** What a ToolContext's channel handles send through (internal). */
type ChannelBinding = {
    /** The engine's registered channels by name, by reference. */
    channels: ReadonlyMap<string, IChannel<any, any>>;
    /** Where emits are recorded. */
    effects: IEffectStore;
    /** Emits in flight in this execution by key: parallel identical emits share one send. */
    inflight: Map<string, Promise<void>>;
};

/** Each execution's ToolContext -> its engine's channels. */
const channelBindings = new WeakMap<object, ChannelBinding>();

/** Binds the engine's channels to `ctx` without adding any property to it. */
export function bindChannels(
    ctx: object,
    channels: ReadonlyMap<string, IChannel<any, any>>,
    effects: IEffectStore,
): void {
    channelBindings.set(ctx, {
        channels, 
        effects, 
        inflight: new Map(), 
    });
}

export function channelsOf(ctx: object): ChannelBinding | undefined {
    return channelBindings.get(ctx);
}
