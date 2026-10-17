/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { LanguageModel, ToolSet } from 'ai';
import type { Budget, RunContext } from '../run/types.ts';
import type { IAgentState, StateSchema } from '../state/types.ts';
import type { TriggerDefinition } from '../trigger/types.ts';

export type ToolFactoryContext<S extends StateSchema = StateSchema> = {
    state: IAgentState<S>;
    run: RunContext;
};

export type ApprovalPolicy = 'user' | ((input: unknown, ctx: { runtimeContext: RunContext }) => 'user' | 'allow' | 'deny');

export type AgentDefinition<S extends StateSchema = StateSchema> = {
    name: string;
    model: LanguageModel;
    instructions: string;
    triggers?: TriggerDefinition[];
    tools?: (ctx: ToolFactoryContext<S>) => ToolSet;
    /** Record<collection, StandardSchemaV1>. */
    state?: S;
    budget?: Partial<Budget>;
    /**
     * Tool name to policy (maps to AI SDK toolApproval). A call needing approval
     * pauses the run in `waiting`; one approval per pause: when a step asks for
     * several, the run waits on the first and the other calls are dropped from
     * the history, so the model requests them again after the resume.
     */
    approvals?: Record<string, ApprovalPolicy>;
    /** Default 24h; on timeout the call is denied. */
    approvalTimeoutMs?: number;
    /** Notifier name registered on the engine. */
    notify?: string;
};

export type Agent<S extends StateSchema = StateSchema> = {
    readonly name: string;
    readonly definition: Required<Pick<AgentDefinition<S>, 'budget'>> & AgentDefinition<S>;
};
