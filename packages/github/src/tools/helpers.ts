/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { jsonSchema } from 'ai';
import type { JSONSchema7, ToolExecutionOptions } from 'ai';
import { ChamberuError, FatalToolError, ValidationError } from '@chamberu/core';
import type { ToolContext } from '@chamberu/core';
import { isObject } from 'smob';
import type { GithubOctokit, IGithubApp } from '../app/types.ts';
import type { NumberInput, RepoInput } from './types.ts';
import { GITHUB_REQUEST_ERROR_CODE, REPO_PATTERN } from './constants.ts';

/**
 * The installation a tool acts as: the delivery's for a run started by a
 * GitHub delivery, else the app's `installationId`. Neither is a
 * FatalToolError, since every GitHub tool of the run would fail.
 */
export function installationIdOf(ctx: ToolContext, app: IGithubApp): number {
    const { trigger } = ctx.run;
    if (trigger.source === 'github' && isObject(trigger.payload)) {
        const { installationId } = trigger.payload;
        if (typeof installationId === 'number') return installationId;
    }
    if (app.installationId !== undefined) return app.installationId;
    throw new FatalToolError('The run has no GitHub installation: start it from a GitHub delivery or set installationId on createGithubApp().');
}

const REPO = new RegExp(REPO_PATTERN);

/** `owner/name`; a ValidationError (a tool error the model can correct) otherwise. */
export function parseRepo(repo: unknown): { owner: string; repo: string } {
    const match = typeof repo === 'string' ? REPO.exec(repo) : null;
    if (!match?.[1] || !match[2]) {
        throw new ValidationError(`repo must look like "owner/name", got ${JSON.stringify(repo)}.`);
    }
    return { owner: match[1], repo: match[2] };
}

/** An integer in `[min, max]`, else a ValidationError. */
export function requireInteger(value: unknown, name: string, min: number, max = Number.MAX_SAFE_INTEGER): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
        throw new ValidationError(`${name} must be an integer from ${min} to ${max}.`);
    }
    return value;
}

/** A non-empty string, else a ValidationError. */
export function requireString(value: unknown, name: string): string {
    if (typeof value !== 'string' || value.length === 0) {
        throw new ValidationError(`${name} must be a non-empty string.`);
    }
    return value;
}

function isToolCallOf(part: unknown, toolCallId: string): boolean {
    return isObject(part) && part.type === 'tool-call' && part.toolCallId === toolCallId;
}

/**
 * The model step a call belongs to: the assistant messages before the one
 * carrying a tool-call part with `options.toolCallId` (the approval path,
 * where the AI SDK passes messages that already hold the requesting
 * assistant message), else all of them.
 */
export function stepOf(options: Pick<ToolExecutionOptions<unknown>, 'toolCallId' | 'messages'>): number {
    let step = 0;
    for (const message of options.messages) {
        if (message.role !== 'assistant') continue;
        if (Array.isArray(message.content) && message.content.some((part) => isToolCallOf(part, options.toolCallId))) {
            return step;
        }
        step++;
    }
    return step;
}

/** The HTTP status of an Octokit RequestError, else undefined. */
export function statusOf(error: unknown): number | undefined {
    if (error instanceof Error && error.name === 'HttpError' && typeof (error as { status?: unknown }).status === 'number') {
        return (error as unknown as { status: number }).status;
    }
    return undefined;
}

/**
 * What a tool throws for a failed GitHub call: `GitHub <status>: <message>`,
 * never the request (an Octokit RequestError carries its headers).
 * chamberu errors (FatalToolError, ValidationError) pass through.
 */
export function toolError(error: unknown): Error {
    if (error instanceof ChamberuError) return error;
    const status = statusOf(error);
    const message = error instanceof Error ? error.message : String(error);
    return new ChamberuError({
        message: status !== undefined ? `GitHub ${status}: ${message}` : `GitHub request failed: ${message}`,
        code: GITHUB_REQUEST_ERROR_CODE,
    });
}

/**
 * Runs `fn` with the run's installation Octokit, every request bound to the
 * run's signal (cancel, drain and the run timeout abort a stalled GitHub
 * call); every failure through `toolError`.
 */
export async function withOctokit<T>(
    app: IGithubApp,
    ctx: ToolContext,
    fn: (octokit: GithubOctokit) => Promise<T>,
): Promise<T> {
    try {
        const octokit = await app.octokit(installationIdOf(ctx, app));
        const { signal } = ctx.run;
        octokit.hook.before('request', (options) => {
            options.request = { ...options.request, signal };
        });
        return await fn(octokit);
    } catch (error) {
        throw toolError(error);
    }
}

export const REPO_PROPERTY: JSONSchema7 = {
    type: 'string',
    pattern: REPO_PATTERN,
    description: 'The repository as "owner/name".',
};

/** An object schema of `properties`, all required unless listed in `optional`. */
export function objectSchema<T>(properties: Record<string, JSONSchema7>, optional: string[] = []) {
    return jsonSchema<T>({
        type: 'object',
        properties,
        required: Object.keys(properties).filter((key) => !optional.includes(key)),
        additionalProperties: false,
    });
}

/** `{ repo, number }` for an issue or a pull request. */
export function numberSchema<T extends NumberInput = NumberInput>(what: string, extra: Record<string, JSONSchema7> = {}, optional: string[] = []) {
    return objectSchema<T>({
        repo: REPO_PROPERTY,
        number: {
            type: 'integer', 
            minimum: 1, 
            description: `The ${what} number.`, 
        },
        ...extra,
    }, optional);
}

/** `{ repo }`. */
export function repoSchema() {
    return objectSchema<RepoInput>({ repo: REPO_PROPERTY });
}
