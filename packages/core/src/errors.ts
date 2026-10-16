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
        super({ message, code: 'budget_exceeded' });
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
