/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    ChamberuError,
    ErrorCode,
    InvalidAgentDefinitionError,
    systemClock,
} from '@chamberu/core';
import type { Issue } from '@ebec/core';
import { isHTTPError } from '@ebec/http';
import type { IHTTPError } from '@ebec/http';
import { AppError, defineErrorHandler } from 'routup';
import type { Handler } from 'routup';
import { isValidupError } from 'validup';
import {
    DEFAULT_BODY_LIMIT,
    DEFAULT_READY_TIMEOUT_MS,
    DEFAULT_STREAM_POLL_MS,
} from './constants.ts';
import type { HttpAppOptions, HttpContext } from './types.ts';

type ErrorBody = {
    status: number;
    code: string;
    message: string;
    issues?: readonly Issue[];
};

const CORE_STATUS: Record<string, number> = {
    [ErrorCode.VALIDATION]: 400,
    [ErrorCode.INVALID_RESUME_TOKEN]: 400,
    [ErrorCode.INVALID_AGENT_DEFINITION]: 400,
    [ErrorCode.RUN_NOT_FOUND]: 404,
    [ErrorCode.INVALID_RUN_STATE]: 409,
};

const APP_ERROR_CODE = 'APP_ERROR';

export function buildContext(options: HttpAppOptions): HttpContext {
    const agents = new Map<string, HttpAppOptions['agents'][number]>();
    for (const agent of options.agents) {
        if (agents.has(agent.name)) {
            throw new InvalidAgentDefinitionError(`Agent "${agent.name}" is registered twice.`);
        }
        agents.set(agent.name, agent);
    }

    const authenticators = Array.isArray(options.auth) ? [...options.auth] : [options.auth];
    if (authenticators.length === 0) {
        throw new InvalidAgentDefinitionError('The http app needs at least one authenticator.');
    }

    return {
        engine: options.engine,
        store: options.store,
        agents,
        authenticators,
        basePath: options.basePath ?? '',
        bodyLimit: options.bodyLimit ?? DEFAULT_BODY_LIMIT,
        streamPollMs: options.stream?.pollMs ?? DEFAULT_STREAM_POLL_MS,
        readyTimeoutMs: options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS,
        clock: options.clock ?? systemClock,
        // eslint-disable-next-line no-console
        onError: options.onError ?? ((error) => console.error('[chamberu]', error)),
    };
}

function withIssues(body: ErrorBody, issues: readonly Issue[] | undefined): ErrorBody {
    return issues && issues.length > 0 ? { ...body, issues } : body;
}

/** routup wraps what a handler throws in an AppError carrying it as `cause`. */
function unwrap(error: unknown): unknown {
    if (error instanceof AppError && error.cause !== undefined) return error.cause;
    return error;
}

function isBareAppError(error: IHTTPError): boolean {
    return error instanceof AppError && error.code === APP_ERROR_CODE;
}

function toErrorBody(cause: unknown): ErrorBody | undefined {
    if (isValidupError(cause)) {
        return withIssues({
            status: 400,
            code: ErrorCode.VALIDATION,
            message: cause.message,
        }, cause.issues);
    }

    if (cause instanceof ChamberuError) {
        const status = CORE_STATUS[cause.code];
        if (status === undefined) return undefined;
        return withIssues({
            status,
            code: cause.code,
            message: cause.message,
        }, cause.issues);
    }

    if (isHTTPError(cause) && !isBareAppError(cause)) {
        return withIssues({
            status: cause.status,
            code: cause.code.toLowerCase(),
            message: cause.message,
        }, cause.issues);
    }

    return undefined;
}

/** Renders every error as `{ status, code, message, issues? }`; never sends a cause. */
export function createErrorHandler(ctx: HttpContext): Handler {
    return defineErrorHandler((error) => {
        const cause = unwrap(error);
        let body = toErrorBody(cause);
        if (!body || body.status >= 500) {
            ctx.onError(cause);
            body = {
                status: body?.status ?? 500,
                code: body?.code ?? 'internal_error',
                message: 'Internal Server Error',
            };
        }

        const headers = new Headers({ 'content-type': 'application/json; charset=utf-8' });
        if (body.status === 401) headers.set('www-authenticate', 'Bearer');
        return new Response(JSON.stringify(body), { status: body.status, headers });
    });
}
