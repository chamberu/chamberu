import { ToolLoopAgent, isStepCount } from 'ai';
import type {
    ModelMessage,
    PrepareStepFunction,
    StepResult,
    StopCondition,
    ToolApprovalRequestOutput,
    ToolApprovalStatus,
    ToolExecutionEndEvent,
    ToolLoopAgentSettings,
    ToolSet,
} from 'ai';
import type { Agent, ApprovalPolicy } from '../agent/types.ts';
import type { Clock } from '../clock.ts';
import { wrapToolsForRun } from '../effect/wrap.ts';
import { BudgetExceededError, FatalToolError } from '../errors.ts';
import type {
    Budget,
    Run,
    RunContext,
    Step,
    Usage,
} from '../run/types.ts';
import { createAgentState } from '../state/api.ts';
import type { Store } from '../store/types.ts';
import type { TriggerEnvelope } from '../trigger/types.ts';
import {
    resolveBudget,
    stepTokens,
    timeoutSignal,
    tokensExceeded,
} from './budget.ts';

export interface ExecuteContext {
    run: Run;
    agent: Agent;
    store: Store;
    clock: Clock;
    /** Aborted by engine.cancel(). */
    signal: AbortSignal;
    /**
     * Settles the run (expects it `running` and claimed by this execution) and
     * emits `run.updated`; resolves undefined without writing once the lease is lost.
     */
    finish: (patch: Partial<Run>) => Promise<Run | undefined>;
    /** Patches the still `running` run and emits `run.updated`. */
    update: (patch: Partial<Run>) => Promise<Run>;
    onStepAppended: (step: Step) => void;
    /**
     * Moves the still `running` run to `waiting` on `request` (releasing its
     * claim and slot) and notifies the owner.
     */
    pause: (request: ApprovalRequest, usage: Usage) => Promise<void>;
    /** HMAC secret the AI SDK signs approval requests with. */
    toolApprovalSecret?: string;
    /**
     * False once another owner took the run over (its lease expired and it was
     * recovered); checked before every step and checkpoint write.
     */
    ownsRun?: () => Promise<boolean>;
}

/** A tool call waiting for the owner's decision. */
export interface ApprovalRequest {
    approvalId: string;
    toolName: string;
    input: unknown;
}

export function renderTrigger(envelope: TriggerEnvelope): string {
    const json = JSON.stringify({
        source: envelope.source,
        trigger: envelope.trigger,
        payload: envelope.payload,
    }, null, 2);
    return `\`\`\`json\n${json}\n\`\`\``;
}

/** `{ code, message }` of anything thrown; code falls back to 'Error'. */
export function toRunError(error: unknown): { code: string; message: string } {
    const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
    return {
        code: typeof code === 'string' ? code : 'Error',
        message: error instanceof Error ? error.message : String(error),
    };
}

/** The tools handed to the agent. Seam for effect memoization (wrapToolsForRun). */
export function assembleTools(ctx: ExecuteContext, runContext: RunContext): ToolSet {
    const factory = ctx.agent.definition.tools;
    if (!factory) return {};
    const tools = factory({ state: createAgentState(ctx.store, ctx.agent.name), run: runContext });
    return wrapToolsForRun(tools, runContext, ctx.store);
}

function toApprovalStatus(decision: 'user' | 'allow' | 'deny'): ToolApprovalStatus {
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
function withoutToolCalls(messages: ModelMessage[], toolCallIds: Set<string>): ModelMessage[] {
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
function untilAborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) return Promise.reject(signal.reason);
    return new Promise<T>((resolve, reject) => {
        const onAbort = () => reject(signal.reason);
        signal.addEventListener('abort', onAbort, { once: true });
        work.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
    });
}

/** Text of the last assistant message, '' when there is none. */
function lastAssistantText(messages: ModelMessage[]): string {
    const last = messages.findLast((m) => m.role === 'assistant');
    if (!last) return '';
    if (typeof last.content === 'string') return last.content;
    return last.content.map((part) => (part.type === 'text' ? part.text : '')).join('');
}

function budgetExceeded(budget: Budget, kind: 'steps' | 'tokens'): BudgetExceededError {
    return new BudgetExceededError(kind === 'steps' ?
        `The run reached its ${budget.maxSteps} step limit.` :
        `The run reached its ${budget.maxTokens} token limit.`);
}

/**
 * One execution of a claimed, `running` run: drives a ToolLoopAgent from the
 * latest checkpoint, checkpoints every step and settles the run.
 */
export async function executeRun(ctx: ExecuteContext): Promise<void> {
    const {
        run,
        agent,
        store,
        clock,
    } = ctx;
    const budget = resolveBudget(agent);
    const checkpoint = await store.latestCheckpoint(run.id);
    const initial: ModelMessage[] = checkpoint?.messages ?? [{ role: 'user', content: renderTrigger(run.trigger) }];
    const usage: Usage = { ...run.usage };
    let stepIndex = checkpoint ? checkpoint.stepIndex + 1 : 0;
    let stepSeq = (await store.listSteps(run.id)).length;

    // paused (or about to) on an approval nobody answered yet: wait again, without a model call
    const unanswered = checkpoint ? pendingApproval(checkpoint.messages) : undefined;
    if (unanswered) {
        await ctx.pause(unanswered, usage);
        return;
    }

    // a resumed approval gets exactly one step beyond maxSteps, so an approval
    // granted (or denied) on the last allowed step still runs and is answered
    const extraSteps = checkpoint && endsOnApprovalResponse(checkpoint.messages) ? 1 : 0;
    const remainingSteps = budget.maxSteps + extraSteps - stepIndex;
    if (remainingSteps <= 0) {
        // the step limit was reached by an earlier execution that did not settle the run
        if (checkpoint && checkpoint.finishReason !== 'tool-calls') {
            await ctx.finish({ status: 'completed', output: lastAssistantText(checkpoint.messages) });
        } else {
            await ctx.finish({ status: 'failed', error: toRunError(budgetExceeded(budget, 'steps')) });
        }
        return;
    }

    const timeout = budget.timeoutMs === undefined ? undefined : timeoutSignal(clock, budget.timeoutMs);
    const signal = timeout ? AbortSignal.any([ctx.signal, timeout.signal]) : ctx.signal;
    const runContext: RunContext = {
        runId: run.id,
        agent: run.agent,
        trigger: run.trigger,
        signal,
    };

    const responseMessages: ModelMessage[] = [];
    // AI SDK swallows onStepEnd errors; a fatal one is kept here and stops the loop
    let fatal: { error: unknown } | undefined;
    // set once the run settles on abort; a still running generate must not write anymore
    let abandoned = false;
    let pendingStepEnd: Promise<void> = Promise.resolve();
    let stepStartedAt = clock.now();
    // the approval the last step asked for; the loop stops on it
    let approval: ApprovalRequest | undefined;
    // errors of approved calls the AI SDK executes before the first model call, by toolCallId
    const preStepErrors = new Map<string, unknown>();
    let beforeFirstStep = true;

    /**
     * Runs a store write unless the execution was abandoned meanwhile or lost
     * the run. `checkOwner: false` skips the ownership read for writes that are
     * owner-conditional in the store already (ctx.update).
     */
    const guarded = async (write: () => Promise<void>, { checkOwner = true } = {}): Promise<boolean> => {
        if (abandoned || signal.aborted) return false;
        if (checkOwner && ctx.ownsRun && !await ctx.ownsRun()) return false;
        if (abandoned || signal.aborted) return false;
        await write();
        return true;
    };

    const append = async (step: Omit<Step, 'runId' | 'index'>) => {
        const full: Step = {
            ...step,
            runId: run.id,
            index: stepSeq,
        };
        if (await guarded(() => store.appendStep(full))) {
            stepSeq++;
            ctx.onStepAppended(full);
        }
    };

    const handleStepEnd = async (step: StepResult<ToolSet>) => {
        try {
            const finishedAt = clock.now();
            const tokens = stepTokens(step);
            await append({
                kind: 'llm',
                name: step.model.modelId,
                output: {
                    text: step.text,
                    toolCalls: step.toolCalls.map((call) => ({
                        toolCallId: call.toolCallId,
                        toolName: call.toolName,
                        input: call.input,
                    })),
                    finishReason: step.finishReason,
                    usage: tokens,
                },
                startedAt: stepStartedAt,
                finishedAt,
            });
            for (const part of step.content) {
                if (part.type === 'tool-result') {
                    await append({
                        kind: 'tool',
                        name: part.toolName,
                        input: part.input,
                        output: part.output,
                        startedAt: stepStartedAt,
                        finishedAt,
                    });
                } else if (part.type === 'tool-error') {
                    await append({
                        kind: 'tool',
                        name: part.toolName,
                        input: part.input,
                        error: toRunError(part.error),
                        startedAt: stepStartedAt,
                        finishedAt,
                    });
                    // other tool errors go back to the model as tool-error results
                    if (part.error instanceof FatalToolError) fatal ??= { error: part.error };
                }
            }
            const requests = step.content.filter(
                (part): part is ToolApprovalRequestOutput<ToolSet> => part.type === 'tool-approval-request' && !part.isAutomatic,
            );
            let { messages }: { messages: ModelMessage[] } = step.response;
            const [first, ...others] = requests;
            if (first) {
                approval = {
                    approvalId: first.approvalId,
                    toolName: first.toolCall.toolName,
                    input: first.toolCall.input,
                };
                if (others.length > 0) {
                    messages = withoutToolCalls(messages, new Set(others.map((r) => r.toolCall.toolCallId)));
                }
            }
            responseMessages.push(...messages);
            await guarded(() => store.saveCheckpoint({
                runId: run.id,
                stepIndex: stepIndex++,
                messages: [...initial, ...responseMessages],
                finishReason: step.finishReason,
                createdAt: finishedAt,
            }));
            usage.inputTokens += tokens.inputTokens;
            usage.outputTokens += tokens.outputTokens;
            await guarded(async () => {
                await ctx.update({ usage: { ...usage }, updatedAt: clock.now() });
            }, { checkOwner: false });
            stepStartedAt = clock.now();
        } catch (error) {
            fatal ??= { error };
        }
    };

    /**
     * Before the first model call: the tool messages the AI SDK produced from
     * an approval response in `initial` (an approved call executed, or denied).
     * They are no step's response messages, so they are recorded here.
     */
    const prepareStep: PrepareStepFunction<ToolSet> = async ({ stepNumber, responseMessages: initialResponses }) => {
        if (stepNumber !== 0) return undefined;
        beforeFirstStep = false;
        const at = clock.now();
        const calls = new Map<string, unknown>();
        for (const message of initial) {
            if (message.role !== 'assistant' || typeof message.content === 'string') continue;
            for (const part of message.content) if (part.type === 'tool-call') calls.set(part.toolCallId, part.input);
        }
        for (const message of initialResponses) {
            responseMessages.push(message);
            if (message.role !== 'tool') continue;
            for (const part of message.content) {
                if (part.type !== 'tool-result') continue;
                // the AI SDK turns a thrown error into an error-text result; record the error itself
                const failed = preStepErrors.has(part.toolCallId);
                const error = preStepErrors.get(part.toolCallId);
                await append({
                    kind: 'tool',
                    name: part.toolName,
                    input: calls.get(part.toolCallId),
                    ...(failed ? { error: toRunError(error) } : { output: part.output }),
                    startedAt: stepStartedAt,
                    finishedAt: at,
                });
                if (error instanceof FatalToolError) fatal ??= { error };
            }
        }
        // stopWhen only runs after a model call: fail before making one
        if (fatal) throw fatal.error;
        return undefined;
    };

    const onToolExecutionEnd = (event: ToolExecutionEndEvent): void => {
        if (beforeFirstStep && event.toolOutput.type === 'tool-error') {
            preStepErrors.set(event.toolOutput.toolCallId, event.toolOutput.error);
        }
    };

    const onStepEnd = (step: StepResult<ToolSet>): Promise<void> => {
        pendingStepEnd = handleStepEnd(step);
        return pendingStepEnd;
    };

    const stopWhen: StopCondition<ToolSet>[] = [isStepCount(remainingSteps), () => fatal !== undefined];
    const spentTokens = run.usage.inputTokens + run.usage.outputTokens;
    if (budget.maxTokens !== undefined) stopWhen.push(tokensExceeded(budget.maxTokens, spentTokens));

    const loop = new ToolLoopAgent({
        model: agent.definition.model,
        instructions: agent.definition.instructions,
        tools: assembleTools(ctx, runContext),
        toolApproval: toToolApproval(agent.definition.approvals, runContext),
        experimental_toolApprovalSecret: ctx.toolApprovalSecret,
        stopWhen,
        prepareStep,
        onStepEnd,
    });

    let result: Awaited<ReturnType<typeof loop.generate>>;
    try {
        const work = loop.generate({
            messages: initial,
            abortSignal: signal,
            onToolExecutionEnd,
        });
        // the agent may keep running after an abort; never leak its rejection
        work.catch(() => {});
        result = await untilAborted(work, signal);
    } catch (error) {
        abandoned = true;
        // a store write already in flight lands before the run settles, never after
        await pendingStepEnd;
        if (ctx.signal.aborted) {
            await ctx.finish({ status: 'cancelled', usage });
        } else if (timeout?.signal.aborted) {
            await ctx.finish({
                status: 'failed',
                usage,
                error: toRunError(timeout.signal.reason),
            });
        } else {
            await ctx.finish({
                status: 'failed',
                usage,
                error: toRunError(fatal ? fatal.error : error),
            });
        }
        return;
    } finally {
        timeout?.clear();
    }

    if (fatal) {
        await ctx.finish({
            status: 'failed',
            usage,
            error: toRunError(fatal.error),
        });
        return;
    }
    if (ctx.signal.aborted) {
        await ctx.finish({ status: 'cancelled', usage });
        return;
    }
    if (approval) {
        await ctx.pause(approval, usage);
        return;
    }

    // the loop ended on a budget stop condition while the model still wanted tools
    const outOfSteps = result.steps.length >= remainingSteps;
    const outOfTokens = budget.maxTokens !== undefined && usage.inputTokens + usage.outputTokens >= budget.maxTokens;
    if (result.finishReason === 'tool-calls' && (outOfSteps || outOfTokens)) {
        await ctx.finish({
            status: 'failed',
            usage,
            error: toRunError(budgetExceeded(budget, outOfSteps ? 'steps' : 'tokens')),
        });
        return;
    }

    await ctx.finish({
        status: 'completed',
        usage,
        output: result.text,
    });
}
