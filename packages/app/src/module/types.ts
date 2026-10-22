/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    Agent,
    Engine,
    IChannel,
    IClock,
    INotifier,
    IStore,
} from '@chamvi/core';
import type {
    AgentIssue,
    Authenticator,
    HttpRoute,
    IShutdown,
} from '@chamvi/http';
import type { IScheduler } from '@chamvi/scheduler';
import type { DataSource } from 'typeorm';
import type { AppConfig } from '../config/types.ts';
import type { Env } from '../env/types.ts';
import type { ILogger } from '../logger/types.ts';
import type { ModelCheck, ModelProviders } from '../models/types.ts';

/** The container and module contracts a module factory is written against (eldin, orkos). */
export type { IContainer } from 'eldin';
export type { IModule } from 'orkos';

export type AppMode = 'start' | 'job' | 'migrate';

export type AppContext = {
    mode: AppMode;
    dev: boolean;
    env: Env;
    /** Aborts with the app_stopped ChamviError once stop() is called. */
    signal: AbortSignal;
    /** Logs through the app logger; during stop() also counts as a stop failure. */
    report(error: unknown, context?: Record<string, unknown>): void;
    /** createApp's `models`. */
    models?: ModelProviders;
    /** createApp's agents (the code agents); the live set is `engine.listAgents()`. */
    agents: readonly Agent[];
};

/**
 * Throws InvalidAgentDefinitionError for an agent a module could not serve
 * (the scheduler: a cron trigger hubwire refuses; http: a `run_<agent>` MCP
 * tool it cannot build). The agents dir runs every check on a folder agent
 * before registering it, so a refusal is a load issue, never a failed boot.
 */
export type AgentCheck = (agent: Agent) => void;

export interface ILifecycleHook {
    readonly name: string;
    /** After `new Engine(...)`, before `engine.start()` (start and job). */
    engineCreated?(engine: Engine): void | Promise<void>;
    /** start only: after scheduler.start(), before serve(). */
    started?(): void | Promise<void>;
    /** start only: inside createShutdown's scheduler step, after scheduler.stop(). */
    stopping?(): void | Promise<void>;
    /** After the engine drained (start and job), before the store closes. */
    drained?(): void | Promise<void>;
}

export type LifecyclePhase = 'engineCreated' | 'started' | 'stopping' | 'drained';

export type AuthenticatorEntry = {
    name: string;
    order: number;
    authenticator: Authenticator;
};

/**
 * The part of the HTTP server (srvx, from routup's `serve()`) the app uses,
 * typed structurally so srvx's declarations stay out of the package's types.
 */
export type Server = {
    readonly url?: string;
    ready(): Promise<unknown>;
    close(closeActiveConnections?: boolean): Promise<void>;
};

export type AppTokens = {
    CONTEXT: AppContext;
    CONFIG: AppConfig;
    LOGGER: ILogger;
    CLOCK: IClock;
    STORE: IStore;
    DATA_SOURCE: DataSource;
    ENGINE: Engine;
    SCHEDULER: IScheduler;
    SHUTDOWN: IShutdown;
    SERVER: Server;
    HTTP_ROUTES: HttpRoute;
    AUTHENTICATORS: AuthenticatorEntry;
    NOTIFIERS: INotifier;
    /** A collection: the channels modules contribute (`registerMany` in `setup`). */
    CHANNELS: IChannel<any, any>;
    LIFECYCLE_HOOKS: ILifecycleHook;
    /** The agents dir's load issues (`chamvi:agents`, when a dir is configured), at the time of the call. */
    AGENT_ISSUES: () => readonly AgentIssue[];
    /** A collection: every module's check of a folder agent before it is registered. */
    AGENT_CHECKS: AgentCheck;
    /** Checks an agent registered after setup (a folder agent) like setup checks the code agents; a no-op with a preset default provider. */
    MODEL_CHECK: ModelCheck;
};
