/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { LanguageModel, OutputInterface, ToolSet } from 'ai';
import type { IRunArtifacts } from '../artifact/types.ts';
import type { Budget, RunContext } from '../run/types.ts';
import type { IAgentState, StateSchema } from '../state/types.ts';
import type { TriggerDefinition } from '../trigger/types.ts';

export type ToolFactoryContext<S extends StateSchema = StateSchema> = {
    state: IAgentState<S>;
    run: RunContext;
    /**
     * The run's artifacts (its attachments and files tools stored). Not an
     * effect: put `put()` inside a `defineEffectTool` to store a file exactly once.
     */
    artifacts: IRunArtifacts;
};

export type ApprovalPolicy = 'user' | ((input: unknown, ctx: { runtimeContext: RunContext }) => 'user' | 'allow' | 'deny');

/**
 * Decides per tool name whether a run may use a tool. A refused tool is not
 * offered to the model; a call to it still arriving is answered with a
 * ToolNotAllowedError tool result. Should depend only on the run snapshot
 * (e.g. \`run.trigger.invoker\`), so the tool set is stable across executions.
 */
export type ToolPolicy = (toolName: string, ctx: { run: RunContext }) => boolean;

export type AgentDefinition<S extends StateSchema = StateSchema> = {
    name: string;
    model: LanguageModel;
    instructions: string;
    triggers?: TriggerDefinition[];
    tools?: (ctx: ToolFactoryContext<S>) => ToolSet;
    /** Filters the merged tool set (state tools included) per run, e.g. requireToolPermission(). */
    toolPolicy?: ToolPolicy;
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
    /**
     * Structured output (AI SDK `Output`, e.g. `Output.object({ schema })`):
     * a completed run's `output` is the parsed value instead of the text; a
     * final answer that does not parse fails the run with a ValidationError.
     */
    output?: OutputInterface;
};

export type Agent<S extends StateSchema = StateSchema> = {
    readonly name: string;
    readonly definition: Required<Pick<AgentDefinition<S>, 'budget'>> & AgentDefinition<S>;
};
