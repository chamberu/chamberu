import {
    ErrorCode,
    LeaseLostError,
    RunEngine,
    RunStatus,
} from '@chamberu/core';
import type { Agent, IStore } from '@chamberu/core';

declare const logger: { error(fields: object, message: string): void };

export function createEngine(store: IStore, agents: Agent[], resumeSecret: string) {
    // #region on-error
    const engine = new RunEngine({
        store,
        agents,
        resumeSecret,
        onError: (error, run) => {
            if (error instanceof LeaseLostError) {
                // another replica carries the run on; nothing to do
                return;
            }
            logger.error({ err: error, runId: run?.id }, 'chamberu');
        },
    });
    // #endregion on-error

    return engine;
}

export async function explainFailure(engine: RunEngine, runId: string) {
    // #region run-error
    const run = await engine.getRun(runId);
    if (run?.status === RunStatus.FAILED) {
        switch (run.error?.code) {
            case ErrorCode.BUDGET_EXCEEDED:
                return 'Raise maxSteps or maxTokens, or narrow the instructions.';
            case ErrorCode.TIMEOUT:
                return 'Raise timeoutMs or make the tools faster.';
            case ErrorCode.FATAL_TOOL:
                return `A tool stopped the run: ${run.error.message}`;
            default:
                return run.error?.message;
        }
    }
    // #endregion run-error
    return undefined;
}
