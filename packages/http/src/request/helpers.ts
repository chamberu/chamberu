/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { flattenIssueItems } from '@ebec/core';
import type { Issue } from '@ebec/core';
import {
    BadRequestError,
    RequestEntityTooLargeError,
    UnsupportedMediaTypeError,
} from '@ebec/http';
import { createURLCodec } from '@rapiq/codec-url';
import {
    CodecError,
    isFilter,
    isFilters,
    isParseError,
} from '@rapiq/core';
import type { Schema } from '@rapiq/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { buildIssuesForStandardSchemaIssues } from '@validup/standard-schema';
import type { IAppEvent } from 'routup';
import { isObject } from 'smob';
import type { Container } from 'validup';
import { MAX_PAGE_LIMIT } from '../app/constants.ts';
import type { DecodedQuery } from './types.ts';

function isJsonMediaType(contentType: string | null): boolean {
    if (!contentType) return false;
    const type = (contentType.split(';')[0] ?? '').trim().toLowerCase();
    return type === 'application/json' || /^[a-z0-9.+-]+\/[a-z0-9.+-]+\+json$/.test(type);
}

function tooLarge(limit: number): RequestEntityTooLargeError {
    return new RequestEntityTooLargeError({ message: `The request body exceeds ${limit} bytes.` });
}

async function readBytes(request: Request, limit: number): Promise<Uint8Array> {
    if (!request.body) return new Uint8Array(0);
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) {
            await reader.cancel().catch(() => {});
            throw tooLarge(limit);
        }
        chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}

/**
 * Reads a JSON body of at most `limit` bytes: `undefined` when empty, 413
 * when too large, 415 for another media type, 400 when unparsable. Call it
 * only after `authorize`.
 */
export async function readJsonBody(event: IAppEvent, limit: number): Promise<unknown> {
    const { request } = event;
    const length = Number(request.headers.get('content-length'));
    if (Number.isFinite(length) && length > limit) throw tooLarge(limit);

    const bytes = await readBytes(request, limit);
    if (bytes.byteLength === 0) return undefined;

    if (!isJsonMediaType(request.headers.get('content-type'))) {
        throw new UnsupportedMediaTypeError({ message: 'The request body must be application/json.' });
    }

    try {
        return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
        throw new BadRequestError({ message: 'The request body is not valid JSON.' });
    }
}

/**
 * Validates a JSON object body with a validup container. A missing body
 * reads as `{}` unless `required`; unknown keys are dropped.
 */
export async function validateBody<T extends Record<string, any>>(
    container: Container<T>,
    body: unknown,
    options: { required?: boolean } = {},
): Promise<T> {
    if (body === undefined) {
        if (options.required) throw new BadRequestError({ message: 'The request needs a JSON body.' });
        body = {};
    }
    if (!isObject(body)) throw new BadRequestError({ message: 'The request body must be a JSON object.' });
    return container.run(body as Partial<T>);
}

function describeIssues(issues: readonly Issue[]): string {
    return flattenIssueItems(issues).map((issue) => {
        const path = issue.path.map(String).join('.');
        return path ? `${path}: ${issue.message}` : issue.message;
    }).join('; ');
}

/** Validates a trigger payload (any JSON) with the trigger's Standard Schema. */
export async function validatePayload(schema: StandardSchemaV1 | undefined, payload: unknown): Promise<unknown> {
    if (!schema) return payload;
    const result = await schema['~standard'].validate(payload);
    if (result.issues) {
        const issues = buildIssuesForStandardSchemaIssues(result.issues);
        throw new BadRequestError({ message: `Invalid payload: ${describeIssues(issues)}`, issues });
    }
    return result.value;
}

const codec = createURLCodec();

// rapiq's Schema is invariant in its record type; the codec takes any of them
type AnySchema = Schema<any>;

function decodeWithCodec(searchParams: URLSearchParams, schema: AnySchema) {
    try {
        return codec.decode(searchParams.toString(), {
            schema,
            fields: false,
            relations: false,
        });
    } catch (error) {
        if (isParseError(error) || error instanceof CodecError) {
            const { issues } = error;
            const message = issues.length > 0 ? flattenIssueItems(issues).map((issue) => issue.message).join('; ') : error.message;
            throw new BadRequestError({ message, issues });
        }
        throw error;
    }
}

/**
 * Decodes a rapiq URL query (bracket or expression dialect) against
 * `schema` (built with `throwOnFailure: true` and without `maxLimit`):
 * 400 for a rejected query, a compound filter or a limit above 100.
 */
export function decodeQuery(searchParams: URLSearchParams, schema: AnySchema): DecodedQuery {
    const query = decodeWithCodec(searchParams, schema);
    if (!query) return { filters: [], sorts: [] };

    const root = query.filters;
    const children = isFilters(root) && root.operator === 'and' ? root.value : [root];
    const filters = children.filter((child) => isFilter(child));
    if (filters.length !== children.length) {
        throw new BadRequestError({ message: 'Only top-level filters joined with "and" are supported.' });
    }

    const { limit, offset } = query.pagination;
    if (limit !== undefined && limit > MAX_PAGE_LIMIT) {
        throw new BadRequestError({ message: `The pagination limit must not exceed the value of ${MAX_PAGE_LIMIT}.` });
    }

    return {
        filters,
        ...(limit !== undefined ? { limit } : {}),
        ...(offset !== undefined ? { offset } : {}),
        sorts: query.sorts.value,
    };
}
