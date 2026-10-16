import { ToolLoopAgent, isStepCount } from 'ai';
import type {
    ModelMessage,
    StepResult,
    StopCondition,
    ToolSet,
} from 'ai';
import type { Agent } from '../agent/types.ts';
import type { Clock } from '../clock.ts';
import type {
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
    /** Settles the run (expects it `running`) and emits `run.updated`. */
    finish: (patch: Partial<Run>) => Promise<Run>;
    onStepAppended: (step: Step) => void;
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
    return factory({ state: createAgentState(ctx.store, ctx.agent.name), run: runContext });
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

    const remainingSteps = budget.maxSteps - stepIndex;
    if (remainingSteps <= 0) {
        await ctx.finish({ status: 'failed', error: { code: 'BudgetExceeded', message: `The run reached its ${budget.maxSteps} step limit.` } });
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
    let stepStartedAt = clock.now();

    const append = async (step: Omit<Step, 'runId' | 'index'>) => {
        const full: Step = {
            ...step,
            runId: run.id,
            index: stepSeq++,
        };
        await store.appendStep(full);
        ctx.onStepAppended(full);
    };

    const onStepEnd = async (step: StepResult<ToolSet>) => {
        try {
            if (signal.aborted) return;
            const finishedAt = clock.now();
            const tokens = stepTokens(step);
            usage.inputTokens += tokens.inputTokens;
            usage.outputTokens += tokens.outputTokens;
            responseMessages.push(...step.response.messages);
            await store.saveCheckpoint({
                runId: run.id,
                stepIndex: stepIndex++,
                messages: [...initial, ...responseMessages],
                createdAt: finishedAt,
            });
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
                    fatal ??= { error: part.error };
                }
            }
            stepStartedAt = clock.now();
        } catch (error) {
            fatal ??= { error };
        }
    };

    const stopWhen: StopCondition<ToolSet>[] = [isStepCount(remainingSteps), () => fatal !== undefined];
    const spentTokens = run.usage.inputTokens + run.usage.outputTokens;
    if (budget.maxTokens !== undefined) stopWhen.push(tokensExceeded(budget.maxTokens, spentTokens));

    const loop = new ToolLoopAgent({
        model: agent.definition.model,
        instructions: agent.definition.instructions,
        tools: assembleTools(ctx, runContext),
        stopWhen,
        onStepEnd,
    });

    let result: Awaited<ReturnType<typeof loop.generate>>;
    try {
        const work = loop.generate({ messages: initial, abortSignal: signal });
        // the agent may keep running after an abort; never leak its rejection
        work.catch(() => {});
        result = await untilAborted(work, signal);
    } catch (error) {
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

    // the loop ended on a budget stop condition while the model still wanted tools
    const outOfSteps = result.steps.length >= remainingSteps;
    const outOfTokens = budget.maxTokens !== undefined && usage.inputTokens + usage.outputTokens >= budget.maxTokens;
    if (result.finishReason === 'tool-calls' && (outOfSteps || outOfTokens)) {
        await ctx.finish({
            status: 'failed',
            usage,
            error: {
                code: 'BudgetExceeded',
                message: outOfSteps ?
                    `The run reached its ${budget.maxSteps} step limit.` :
                    `The run reached its ${budget.maxTokens} token limit.`,
            },
        });
        return;
    }

    await ctx.finish({
        status: 'completed',
        usage,
        output: result.text,
    });
}
