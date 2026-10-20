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
import type { Handler, IAppEvent } from 'routup';
import { isValidupError } from 'validup';
import {
    DEFAULT_BODY_LIMIT,
    DEFAULT_MAX_OPEN_STREAMS,
    DEFAULT_READY_TIMEOUT_MS,
    DEFAULT_STREAM_POLL_MS,
    STREAM_RETRY_AFTER_SECONDS,
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
    [ErrorCode.RUN_NOT_FOUND]: 404,
    [ErrorCode.ARTIFACT_NOT_FOUND]: 404,
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

    const maxOpenStreams = options.stream?.maxOpen ?? DEFAULT_MAX_OPEN_STREAMS;
    if (!Number.isSafeInteger(maxOpenStreams) || maxOpenStreams < 1) {
        throw new InvalidAgentDefinitionError(`stream.maxOpen must be a positive integer, got ${maxOpenStreams}.`);
    }

    return {
        engine: options.engine,
        store: options.store,
        agents,
        authenticators,
        basePath: options.basePath ?? '',
        bodyLimit: options.bodyLimit ?? DEFAULT_BODY_LIMIT,
        streamPollMs: options.stream?.pollMs ?? DEFAULT_STREAM_POLL_MS,
        maxOpenStreams,
        openStreams: 0,
        readyTimeoutMs: options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS,
        clock: options.clock ?? systemClock,
        shutdown: options.shutdown,
        closers: new Set(),
        closed: false,
        // eslint-disable-next-line no-console
        onError: options.onError ?? ((error) => console.error('[chamberu]', error)),
    };
}

function renderError(event: IAppEvent, body: ErrorBody): Response {
    const headers = new Headers(event.response.headers);
    headers.set('content-type', 'application/json; charset=utf-8');
    if (body.status === 401) headers.set('www-authenticate', 'Bearer');
    return new Response(JSON.stringify(body), { status: body.status, headers });
}

/**
 * A 503 once the shutdown ran the closers (streams ended, MCP handler
 * closed), else `undefined`. Rendered here, not thrown: an expected
 * refusal is not reported to `onError`.
 */
export function refuseWhenClosed(event: IAppEvent, ctx: HttpContext): Response | undefined {
    if (!ctx.closed) return undefined;
    return renderError(event, {
        status: 503,
        code: 'service_unavailable',
        message: 'The server is shutting down.',
    });
}

/**
 * Takes one of the app's `stream.maxOpen` slots: the release (idempotent,
 * call it on every exit path), or `undefined` when all are taken.
 */
export function acquireStreamSlot(ctx: HttpContext): (() => void) | undefined {
    if (ctx.openStreams >= ctx.maxOpenStreams) return undefined;
    ctx.openStreams++;
    let released = false;
    return () => {
        if (released) return;
        released = true;
        ctx.openStreams--;
    };
}

/**
 * The 503 (with `Retry-After`) of a stream over `stream.maxOpen`. Rendered
 * here, not thrown: an expected refusal is not reported to `onError`.
 */
export function refuseStreamOverCap(event: IAppEvent): Response {
    event.response.headers.set('retry-after', String(STREAM_RETRY_AFTER_SECONDS));
    return renderError(event, {
        status: 503,
        code: 'service_unavailable',
        message: 'Too many open streams, retry later.',
    });
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
    // before validup: isValidupError duck-types any error carrying issues
    if (isHTTPError(cause) && !isBareAppError(cause)) {
        return withIssues({
            status: cause.status,
            code: cause.code.toLowerCase(),
            message: cause.message,
        }, cause.issues);
    }

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

    return undefined;
}

/**
 * Renders every error as `{ status, code, message, issues? }`; never sends a cause.
 * Keeps the headers plugins already set (CORS, `RateLimit-*`, `Retry-After`).
 */
export function createErrorHandler(ctx: HttpContext): Handler {
    return defineErrorHandler((error, event) => {
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

        return renderError(event, body);
    });
}
