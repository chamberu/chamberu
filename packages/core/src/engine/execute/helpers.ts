/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    FinishReason,
    LanguageModelResponseMetadata,
    LanguageModelUsage,
    ModelMessage,
    StepResult,
    ToolApprovalStatus,
    ToolLoopAgentSettings,
    ToolSet,
} from 'ai';
import { isObject } from 'smob';
import type { ApprovalPolicy } from '../../agent/types.ts';
import { toFilePart } from '../../artifact/helpers.ts';
import { createRunArtifacts } from '../../artifact/module.ts';
import { wrapToolsForRun } from '../../effect/wrap.ts';
import { BudgetExceededError, IncompleteResponseError, ValidationError } from '../../errors/index.ts';
import type { Budget, Checkpoint, RunContext } from '../../run/types.ts';
import { createAgentState } from '../../state/module.ts';
import { createStateTools } from '../../state/tools.ts';
import type { TriggerEnvelope } from '../../trigger/types.ts';
import { MAX_ERROR_CAUSE_LENGTH } from './constants.ts';
import type { ApprovalRequest, ExecuteContext } from './types.ts';

export function renderTrigger(envelope: TriggerEnvelope): string {
    const json = JSON.stringify({
        source: envelope.source,
        trigger: envelope.trigger,
        payload: envelope.payload,
    }, null, 2);
    return `\`\`\`json\n${json}\n\`\`\``;
}

/**
 * The run's first message: the rendered trigger, followed by a file part per
 * attachment that holds the artifact marker (hydrated to bytes for the model).
 */
export function initialMessage(envelope: TriggerEnvelope): ModelMessage {
    const text = renderTrigger(envelope);
    if (!envelope.attachments?.length) return { role: 'user', content: text };
    return {
        role: 'user',
        content: [{ type: 'text', text }, ...envelope.attachments.map(toFilePart)],
    };
}

/** `{ code, message }` of anything thrown; code falls back to 'Error'. */
export function toRunError(error: unknown): { code: string; message: string } {
    const code = isObject(error) ? error.code : undefined;
    return {
        code: typeof code === 'string' ? code : 'Error',
        message: error instanceof Error ? error.message : String(error),
    };
}

/**
 * The tools handed to the agent: generated state tools (when the agent declares
 * `state`) merged with the user's tools, which win on a name clash. Every tool
 * stays executable, so an approved call from an older history still gets an
 * answer; `activeTools` (the names the agent's toolPolicy allows, undefined
 * without a policy) is what the model is offered. wrapToolsForRun memoizes
 * effects and re-checks the policy per call, so a refused call is a tool error.
 */
export function assembleTools(ctx: ExecuteContext, runContext: RunContext): {
    tools: ToolSet;
    activeTools?: string[];
} {
    const {
        tools: factory,
        state: schema,
        toolPolicy,
    } = ctx.agent.definition;
    if (!factory && !schema) return { tools: {} };
    const state = createAgentState(ctx.agent.name, schema, ctx.store);
    const tools: ToolSet = {
        ...(schema ? createStateTools(state, schema) : {}),
        ...factory?.({
            state,
            run: runContext,
            artifacts: createRunArtifacts(ctx.store, { id: ctx.run.id, agent: ctx.run.agent }, ctx.clock),
        }),
    };
    if (!toolPolicy) return { tools: wrapToolsForRun(tools, runContext, ctx.store) };
    const allow = (name: string) => toolPolicy(name, { run: runContext });
    return {
        tools: wrapToolsForRun(tools, runContext, ctx.store, allow),
        activeTools: Object.keys(tools).filter(allow),
    };
}

export function toApprovalStatus(decision: 'user' | 'allow' | 'deny'): ToolApprovalStatus {
    if (decision === 'user') return 'user-approval';
    if (decision === 'deny') return { type: 'denied' };
    return undefined;
}

/** `def.approvals` as AI SDK toolApproval: 'user' asks the owner, a function decides per call. */
export function toToolApproval(
    approvals: Record<string, ApprovalPolicy> | undefined,
    runContext: RunContext,
): ToolLoopAgentSettings<never, ToolSet>['toolApproval'] {
    if (!approvals) return undefined;
    const config: Record<string, ToolApprovalStatus | ((input: unknown) => ToolApprovalStatus)> = {};
    for (const [name, policy] of Object.entries(approvals)) {
        config[name] = policy === 'user' ?
            'user-approval' :
            (input: unknown) => toApprovalStatus(policy(input, { runtimeContext: runContext }));
    }
    return config;
}

/**
 * The first approval request in `messages` that has no response yet: the
 * checkpoint of a run that paused (or was about to) on it.
 */
export function pendingApproval(messages: ModelMessage[]): ApprovalRequest | undefined {
    const answered = new Set<string>();
    const calls = new Map<string, { toolName: string; input: unknown }>();
    for (const message of messages) {
        if (typeof message.content === 'string') continue;
        for (const part of message.content) {
            if (part.type === 'tool-approval-response') answered.add(part.approvalId);
            if (part.type === 'tool-call') calls.set(part.toolCallId, part);
        }
    }
    for (const message of messages) {
        if (message.role !== 'assistant' || typeof message.content === 'string') continue;
        for (const part of message.content) {
            if (part.type !== 'tool-approval-request' || answered.has(part.approvalId)) continue;
            const call = calls.get(part.toolCallId);
            if (call) {
                return {
                    approvalId: part.approvalId,
                    toolName: call.toolName,
                    input: call.input,
                };
            }
        }
    }
    return undefined;
}

/**
 * True when `messages` end on an approval response whose tool call has no
 * result yet: the AI SDK executes (or denies) that call before the first model
 * call, which the step budget does not count.
 */
export function endsOnApprovalResponse(messages: ModelMessage[]): boolean {
    const last = messages.at(-1);
    if (last?.role !== 'tool') return false;
    const answered = new Set<string>();
    for (const part of last.content) if (part.type === 'tool-approval-response') answered.add(part.approvalId);
    if (answered.size === 0) return false;
    const calls = new Set<string>();
    const results = new Set<string>();
    for (const message of messages) {
        if (typeof message.content === 'string') continue;
        for (const part of message.content) {
            if (part.type === 'tool-approval-request' && answered.has(part.approvalId)) calls.add(part.toolCallId);
            if (part.type === 'tool-result') results.add(part.toolCallId);
        }
    }
    return calls.values().some((id) => !results.has(id));
}

/**
 * Drops the tool calls (and their approval requests) of `toolCallIds` from
 * assistant messages: one approval per pause, so the model sees only the
 * answered call and requests the dropped ones again if it still needs them.
 */
export function withoutToolCalls(messages: ModelMessage[], toolCallIds: Set<string>): ModelMessage[] {
    return messages.map((message) => {
        if (message.role !== 'assistant' || typeof message.content === 'string') return message;
        return {
            ...message,
            content: message.content.filter((part) => !(
                (part.type === 'tool-call' || part.type === 'tool-approval-request') &&
                toolCallIds.has(part.toolCallId)
            )),
        };
    });
}

/** Rejects with the abort reason as soon as `signal` aborts, even if `work` ignores the signal. */
export function untilAborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) return Promise.reject(signal.reason);
    return new Promise<T>((resolve, reject) => {
        const onAbort = () => reject(signal.reason);
        signal.addEventListener('abort', onAbort, { once: true });
        work.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
    });
}

/** Text of the last assistant message, '' when there is none. */
export function lastAssistantText(messages: ModelMessage[]): string {
    const last = messages.findLast((m) => m.role === 'assistant');
    if (!last) return '';
    if (typeof last.content === 'string') return last.content;
    return last.content.map((part) => (part.type === 'text' ? part.text : '')).join('');
}

export function budgetExceeded(budget: Budget, kind: 'steps' | 'tokens'): BudgetExceededError {
    return new BudgetExceededError(kind === 'steps' ?
        `The run reached its ${budget.maxSteps} step limit.` :
        `The run reached its ${budget.maxTokens} token limit.`);
}

/**
 * A structured output that failed to parse or validate, as a core ValidationError;
 * the cause (JSON parse or schema error) names the offending text or field, cut
 * to MAX_ERROR_CAUSE_LENGTH characters (the whole answer stays in the llm step).
 */
export function toValidationError(error: unknown): ValidationError {
    const message = error instanceof Error ? error.message : String(error);
    let cause = isObject(error) && error.cause instanceof Error ? error.cause.message : undefined;
    if (cause && cause.length > MAX_ERROR_CAUSE_LENGTH) cause = `${cause.slice(0, MAX_ERROR_CAUSE_LENGTH)}…`;
    return new ValidationError(cause ? `${message} ${cause}` : message);
}

/** Names of the step's tool calls that got neither a result nor an error. */
export function unansweredToolNames(step: StepResult<ToolSet> | undefined): string[] {
    if (!step) return [];
    const answered = new Set<string>();
    for (const part of step.content) {
        if (part.type === 'tool-result' || part.type === 'tool-error') answered.add(part.toolCallId);
    }
    return step.toolCalls.filter((call) => !answered.has(call.toolCallId)).map((call) => call.toolName);
}

/**
 * Why a structured output has no complete answer to parse, for a loop that
 * ended on `finishReason`: the answer was cut off ('length'), or the loop ended
 * on tool calls nothing executed ('tool-calls' without a budget stop, e.g. a
 * tool without `execute`). Undefined when the answer can be parsed.
 */
export function incompleteOutput(finishReason: string | undefined, toolNames: string[] = []): IncompleteResponseError | undefined {
    if (finishReason === 'length') {
        return new IncompleteResponseError(
            'The model answer was cut off at its output token limit (finish reason length), so there is no complete output to parse.',
        );
    }
    if (finishReason === 'tool-calls') {
        const names = toolNames.length > 0 ? toolNames.map((name) => `"${name}"`).join(', ') : 'a tool';
        return new IncompleteResponseError(
            `The model ended on a call to ${names} that nothing executed (a tool without execute), so there is no final answer to parse.`,
        );
    }
    return undefined;
}

/**
 * The context `Output.parseCompleteOutput` gets for the final answer of an
 * earlier execution: its finish reason, zero usage, minimal response metadata.
 */
export function outputContext(checkpoint: Checkpoint, now: Date): {
    response: Omit<LanguageModelResponseMetadata, 'messages' | 'body'>;
    usage: LanguageModelUsage;
    finishReason: FinishReason;
} {
    return {
        response: {
            id: `checkpoint-${checkpoint.runId}-${checkpoint.stepIndex}`,
            timestamp: now,
            modelId: 'checkpoint',
        },
        usage: {
            inputTokens: 0,
            inputTokenDetails: {
                noCacheTokens: 0,
                cacheReadTokens: 0,
                cacheWriteTokens: 0,
            },
            outputTokens: 0,
            outputTokenDetails: {
                textTokens: 0,
                reasoningTokens: 0,
            },
            totalTokens: 0,
        },
        finishReason: (checkpoint.finishReason ?? 'other') as FinishReason,
    };
}
