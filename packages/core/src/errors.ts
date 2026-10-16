/* eslint-disable max-classes-per-file */
import { BaseError } from '@ebec/core';

export class ChamberuError extends BaseError {}

export class InvalidAgentDefinitionError extends ChamberuError {
    constructor(message: string) {
        super({ message, code: 'invalid_agent_definition' });
    }
}

export class InvalidResumeTokenError extends ChamberuError {
    constructor(message = 'The resume token is invalid or expired.') {
        super({ message, code: 'invalid_resume_token' });
    }
}

export class BudgetExceededError extends ChamberuError {
    constructor(message = 'The run budget was exceeded.') {
        super({ message, code: 'BudgetExceeded' });
    }
}

/**
 * Thrown from a tool's execute to fail the whole run. Any other tool error is
 * fed back to the model as a tool-error result.
 */
export class FatalToolError extends ChamberuError {
    constructor(message: string, code = 'FatalToolError') {
        super({ message, code });
    }
}

export class RunNotFoundError extends ChamberuError {
    constructor(runId: string) {
        super({ message: `Run "${runId}" was not found.`, code: 'run_not_found' });
    }
}

export class InvalidRunStateError extends ChamberuError {
    constructor(message: string) {
        super({ message, code: 'invalid_run_state' });
    }
}

/**
 * Reported to onError when this engine stops executing a run because its
 * claim was lost (renewal refused, or another owner took the run over). The
 * run is not failed: its current owner, or recovery after the claim expired,
 * carries it on.
 */
export class LeaseLostError extends ChamberuError {
    readonly runId: string;

    constructor(runId: string) {
        super({ message: `Lost the claim of run "${runId}"; it is no longer executed here.`, code: 'lease_lost' });
        this.runId = runId;
    }
}

/** A value failed its Standard Schema validation (e.g. a state document on upsert). */
export class ValidationError extends ChamberuError {
    /** The Standard Schema issues, with path segments flattened to keys. */
    readonly validationIssues: ReadonlyArray<{ message: string; path?: ReadonlyArray<PropertyKey> }>;

    constructor(message: string, validationIssues: ReadonlyArray<{ message: string; path?: ReadonlyArray<PropertyKey> }> = []) {
        super({ message, code: 'validation_error' });
        this.validationIssues = validationIssues;
    }
}
