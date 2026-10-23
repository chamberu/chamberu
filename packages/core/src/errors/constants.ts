/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export const ErrorCode = {
    AGENT_NOT_FOUND: 'agent_not_found',
    ARTIFACT_NOT_FOUND: 'artifact_not_found',
    BUDGET_EXCEEDED: 'BudgetExceeded',
    CHANNEL_NOT_FOUND: 'channel_not_found',
    CONTEXT_NOT_PROVIDED: 'context_not_provided',
    FATAL_TOOL: 'FatalToolError',
    INCOMPLETE_RESPONSE: 'incomplete_response',
    INVALID_AGENT_DEFINITION: 'invalid_agent_definition',
    INVALID_RESUME_TOKEN: 'invalid_resume_token',
    INVALID_RUN_STATE: 'invalid_run_state',
    LEASE_LOST: 'lease_lost',
    RUN_NOT_FOUND: 'run_not_found',
    SANDBOX: 'sandbox_error',
    TIMEOUT: 'Timeout',
    TOOL_DENIED: 'tool_denied',
    TOOL_NOT_ALLOWED: 'tool_not_allowed',
    VALIDATION: 'validation_error',
} as const;

export type ErrorCode = typeof ErrorCode[keyof typeof ErrorCode];
