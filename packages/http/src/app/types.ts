/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    Agent,
    IClock,
    IStore,
    RunEngine,
} from '@chamberu/core';
import type { Options as CorsPluginOptions } from '@routup/cors';
import type { Options as PrometheusPluginOptions } from '@routup/prometheus';
import type { Options as RateLimitPluginOptions } from '@routup/rate-limit';
import type { AppOptionsInput } from 'routup';
import type { Authenticator } from '../auth/types.ts';
import type { IShutdown } from '../shutdown/types.ts';

// #region options
export type CorsOptions = CorsPluginOptions;

export type RateLimitOptions = RateLimitPluginOptions;

export type PrometheusOptions = PrometheusPluginOptions;

/** routup's trust-proxy input: a predicate, CIDRs, `'loopback'`, a hop count or a boolean. */
export type TrustProxyInput = NonNullable<AppOptionsInput['trustProxy']>;

export type McpOptions = {
    name?: string;
    version?: string;
    maxWaitSeconds?: number;
};

export type HttpAppOptions = {
    engine: RunEngine;
    store: IStore;
    agents: Agent[];
    /** One authenticator or a chain; the first principal wins. */
    auth: Authenticator | Authenticator[];
    /** Prefix of every route, e.g. `/api`. Default: none. */
    basePath?: string;
    /** Which proxies `getRequestIP` trusts (and so the rate-limit key). Default: none. */
    trustProxy?: TrustProxyInput;
    /** Fails `/readyz` once shutting down; the app ends its streams on shutdown. */
    shutdown?: IShutdown;
    /** Bytes a request body may have. Default: 1 MiB. */
    bodyLimit?: number;
    stream?: { pollMs?: number };
    mcp?: false | McpOptions;
    /** CORS is off unless given. */
    cors?: false | CorsOptions;
    rateLimit?: false | Partial<RateLimitOptions>;
    metrics?: false | Partial<PrometheusOptions>;
    /** How long `/readyz` waits for the store. Default: 2 s. */
    readyTimeoutMs?: number;
    clock?: IClock;
    /** Receives 5xx causes and background failures. Default: `console.error`. */
    onError?: (error: unknown) => void;
};

// #endregion options

/** Shared by every route module; internal. */
export type HttpContext = {
    engine: RunEngine;
    store: IStore;
    agents: Map<string, Agent>;
    authenticators: Authenticator[];
    basePath: string;
    bodyLimit: number;
    streamPollMs: number;
    readyTimeoutMs: number;
    clock: IClock;
    shutdown?: IShutdown;
    /** Ends open streams and closes handlers on shutdown. */
    closers: Set<() => void | Promise<void>>;
    onError: (error: unknown) => void;
};
