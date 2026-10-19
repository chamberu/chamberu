/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ToolLoopAgent, isStepCount } from 'ai';
import type {
    ModelMessage,
    PrepareStepFunction,
    StepResult,
    StopCondition,
    ToolApprovalRequestOutput,
    ToolExecutionEndEvent,
    ToolSet,
} from 'ai';
import { FatalToolError } from '../../errors/index.ts';
import { RunStatus } from '../../run/constants.ts';
import type { RunContext, Step, Usage } from '../../run/types.ts';
import {
    resolveBudget,
    stepTokens,
    timeoutSignal,
    tokensExceeded,
} from '../budget.ts';
import {
    assembleTools,
    budgetExceeded,
    endsOnApprovalResponse,
    lastAssistantText,
    outputContext,
    pendingApproval,
    renderTrigger,
    toRunError,
    toToolApproval,
    toValidationError,
    untilAborted,
    withoutToolCalls,
} from './helpers.ts';
import type { ApprovalRequest, ExecuteContext } from './types.ts';

/**
 * One execution of a claimed, `running` run: streams a ToolLoopAgent from the
 * latest checkpoint (emitting text and reasoning deltas), checkpoints every
 * step and settles the run.
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
            const text = lastAssistantText(checkpoint.messages);
            const { output } = agent.definition;
            if (!output) {
                await ctx.finish({ status: RunStatus.COMPLETED, output: text });
                return;
            }
            try {
                const parsed: unknown = await output.parseCompleteOutput({ text }, outputContext(checkpoint, clock.now()));
                await ctx.finish({ status: RunStatus.COMPLETED, output: parsed });
            } catch (error) {
                await ctx.finish({ status: RunStatus.FAILED, error: toRunError(toValidationError(error)) });
            }
        } else {
            await ctx.finish({ status: RunStatus.FAILED, error: toRunError(budgetExceeded(budget, 'steps')) });
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
    // set once the run settles on abort; a still running stream must not write anymore
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
     * the run. An abort alone does not stop it: a step that completed before a
     * drain or cancel still lands whole (its tool rows and checkpoint), so a
     * recovery does not re-run it. `checkOwner: false` skips the ownership read
     * for writes that are owner-conditional in the store already (ctx.update).
     */
    const guarded = async (write: () => Promise<void>, { checkOwner = true } = {}): Promise<boolean> => {
        if (abandoned) return false;
        if (checkOwner && ctx.ownsRun && !await ctx.ownsRun()) return false;
        if (abandoned) return false;
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
        output: agent.definition.output,
    });

    // stream steps seen so far; a step's deltas belong to the checkpoint index it is saved under
    const firstStepIndex = stepIndex;
    let streamStep = -1;
    const consume = async () => {
        // onError is no typed agent stream parameter but reaches streamText; the
        // error is the run's, so the AI SDK's default console logging is muted
        const options = {
            messages: initial,
            abortSignal: signal,
            onToolExecutionEnd,
            onError: () => {},
        };
        const stream = await loop.stream(options);
        // the first stream error fails the run, as a rejected generate did
        let streamError: { error: unknown } | undefined;
        for await (const part of stream.fullStream) {
            if (part.type === 'start-step') {
                streamStep++;
            } else if (part.type === 'text-delta' || part.type === 'reasoning-delta') {
                if (!abandoned) {
                    ctx.onDelta({
                        runId: run.id,
                        step: firstStepIndex + Math.max(streamStep, 0),
                        kind: part.type === 'text-delta' ? 'text' : 'reasoning',
                        text: part.text,
                    });
                }
            } else if (part.type === 'error') {
                streamError ??= { error: part.error };
            }
        }
        if (streamError) throw streamError.error;
        const [steps, finishReason, text] = await Promise.all([stream.steps, stream.finishReason, stream.text]);
        return {
            stream,
            steps,
            finishReason,
            text,
        };
    };

    let result: Awaited<ReturnType<typeof consume>>;
    try {
        const work = consume();
        // the agent may keep running after an abort; never leak its rejection
        work.catch(() => {});
        result = await untilAborted(work, signal);
    } catch (error) {
        // the step-end writes in flight land completely before the run settles, never after
        let settled: Promise<void>;
        do {
            settled = pendingStepEnd;
            await settled;
        } while (settled !== pendingStepEnd);
        abandoned = true;
        if (ctx.signal.aborted) {
            await ctx.finish({ status: RunStatus.CANCELLED, usage });
        } else if (timeout?.signal.aborted) {
            await ctx.finish({
                status: RunStatus.FAILED,
                usage,
                error: toRunError(timeout.signal.reason),
            });
        } else {
            await ctx.finish({
                status: RunStatus.FAILED,
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
            status: RunStatus.FAILED,
            usage,
            error: toRunError(fatal.error),
        });
        return;
    }
    if (ctx.signal.aborted) {
        await ctx.finish({ status: RunStatus.CANCELLED, usage });
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
            status: RunStatus.FAILED,
            usage,
            error: toRunError(budgetExceeded(budget, outOfSteps ? 'steps' : 'tokens')),
        });
        return;
    }

    if (!agent.definition.output) {
        await ctx.finish({
            status: RunStatus.COMPLETED,
            usage,
            output: result.text,
        });
        return;
    }
    let output: unknown;
    try {
        output = await result.stream.output;
    } catch (error) {
        await ctx.finish({
            status: RunStatus.FAILED,
            usage,
            error: toRunError(toValidationError(error)),
        });
        return;
    }
    await ctx.finish({
        status: RunStatus.COMPLETED,
        usage,
        output,
    });
}
