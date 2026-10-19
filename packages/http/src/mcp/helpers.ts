/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ChamberuError } from '@chamberu/core';
import { isHTTPError } from '@ebec/http';
import type { CallToolResult } from '@modelcontextprotocol/server';
import { isObject } from 'smob';
import type { HttpContext } from '../app/types.ts';
import type { McpRequestExtra } from './types.ts';

/** A tool result carrying `value` as JSON text and as structured content. */
export function toolResult(value: object): CallToolResult {
    // Dates and other toJSON values become what the wire carries
    const structured = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
    return {
        content: [{ type: 'text', text: JSON.stringify(structured) }],
        structuredContent: structured,
    };
}

export function toolError(message: string): CallToolResult {
    return { isError: true, content: [{ type: 'text', text: message }] };
}

/**
 * Runs a tool body: HTTP and core errors become `isError` results with
 * their message, anything else goes to `onError` and reads as
 * `Internal Server Error`.
 */
export async function runTool(ctx: HttpContext, fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
    try {
        return await fn();
    } catch (error) {
        if ((isHTTPError(error) && error.status < 500) || error instanceof ChamberuError) {
            return toolError(error.message);
        }
        ctx.onError(error);
        return toolError('Internal Server Error');
    }
}

/** The principal and request signal the route put on `authInfo.extra`. */
export function readRequestExtra(extra: Record<string, unknown> | undefined): McpRequestExtra | undefined {
    if (!isObject(extra) || !isObject(extra.principal) || !(extra.signal instanceof AbortSignal)) return undefined;
    return extra as unknown as McpRequestExtra;
}
