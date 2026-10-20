/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export const ErrorCode = {
    ARTIFACT_NOT_FOUND: 'artifact_not_found',
    BUDGET_EXCEEDED: 'BudgetExceeded',
    FATAL_TOOL: 'FatalToolError',
    INVALID_AGENT_DEFINITION: 'invalid_agent_definition',
    INVALID_RESUME_TOKEN: 'invalid_resume_token',
    INVALID_RUN_STATE: 'invalid_run_state',
    LEASE_LOST: 'lease_lost',
    RUN_NOT_FOUND: 'run_not_found',
    TIMEOUT: 'Timeout',
    TOOL_NOT_ALLOWED: 'tool_not_allowed',
    VALIDATION: 'validation_error',
} as const;

export type ErrorCode = typeof ErrorCode[keyof typeof ErrorCode];
