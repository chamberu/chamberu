/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { LanguageModel, OutputInterface, ToolSet } from 'ai';
import type { Budget, RunContext } from '../run/types.ts';
import type { StateSchema } from '../state/types.ts';
import type { ToolContext } from '../tool/types.ts';
import type { TriggerDefinition } from '../trigger/types.ts';

/** The factory's argument: the same ToolContext the run's chamvi tools get. */
export type ToolFactoryContext<S extends StateSchema = StateSchema> = ToolContext<S>;

export type ApprovalPolicy = 'user' | ((input: unknown, ctx: { runtimeContext: RunContext }) => 'user' | 'allow' | 'deny');

/**
 * Decides per tool name whether a run may use a tool. A refused tool is not
 * offered to the model (it is left out of `activeTools`). A call to it that
 * still arrives is a tool error, never a run failure, and its tool step
 * records `tool_not_allowed` (ToolNotAllowedError) on both paths:
 * - the model calls it anyway: the AI SDK answers the model with its
 *   unavailable-tool error (NoSuchToolError), the engine records the step
 *   as ToolNotAllowedError;
 * - an approved call from an older history (the policy changed before the
 *   resume) reaches the engine's per-call re-check, which answers the model
 *   with ToolNotAllowedError.
 * Should depend only on the run snapshot (e.g. `run.trigger.invoker`), so
 * the tool set is stable across executions.
 */
export type ToolPolicy = (toolName: string, ctx: { run: RunContext }) => boolean;

export type AgentDefinition<S extends StateSchema = StateSchema> = {
    name: string;
    model: LanguageModel;
    instructions: string;
    triggers?: TriggerDefinition[];
    /**
     * The agent's tools: a plain `ToolSet` (the default), or a factory for
     * dynamic sets, called once per execution with the same ToolContext the
     * tools get. Tools built with `defineTool`/`defineEffectTool` receive that
     * context as `context` in `execute`.
     */
    tools?: ToolSet | ((ctx: ToolContext<S>) => ToolSet);
    /**
     * Per tool name, the context of a tool that is not chamvi's (e.g. a
     * third-party tool with its own `contextSchema`), passed through unchanged
     * by reference to every call of every run: treat it as immutable. An entry
     * naming a chamvi tool or no tool is an InvalidAgentDefinitionError (at
     * defineAgent for a plain set, a failed run for a factory).
     */
    toolsContext?: Record<string, unknown>;
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

/**
 * The revision marker of a folder agent: the content hash of its folder
 * (never its code) and when that hash was recorded.
 */
export type AgentRevision = {
    agent: string;
    hash: string;
    changedAt: Date;
};
