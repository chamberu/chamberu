import type { LanguageModel, ToolSet } from 'ai';
import type { Budget, RunContext } from '../run/types.ts';
import type { AgentState, StateSchema } from '../state/api.ts';
import type { TriggerDefinition } from '../trigger/types.ts';

export interface ToolFactoryContext<S extends StateSchema = StateSchema> {
    state: AgentState<S>;
    run: RunContext;
}

export type ApprovalPolicy =    'user' | ((input: unknown, ctx: { runtimeContext: RunContext }) => 'user' | 'allow' | 'deny');

export interface AgentDefinition<S extends StateSchema = StateSchema> {
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
}

export interface Agent<S extends StateSchema = StateSchema> {
    readonly name: string;
    readonly definition: Required<Pick<AgentDefinition<S>, 'budget'>> & AgentDefinition<S>;
}
