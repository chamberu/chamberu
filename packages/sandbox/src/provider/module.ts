/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError, SandboxError, ValidationError } from '@chamvi/core';
import { isObject } from 'smob';
import { assertSandboxEnv } from '../limits/module.ts';
import type { WorkspaceInfo } from '../workspace/types.ts';
import { isName } from './helpers.ts';
import type { WorkspaceCreateOptions } from './types.ts';

/**
 * Checks a create input: a non-empty `runId`, with `image: true` an
 * `image` that is undefined or a non-empty string without NUL (ValidationError),
 * then the `env` (`assertSandboxEnv`).
 */
export function assertCreateInput(input: WorkspaceCreateOptions, options: { image?: boolean } = {}): void {
    if (typeof input?.runId !== 'string' || input.runId.length === 0) {
        throw new ValidationError('runId must be a non-empty string.');
    }
    if (options.image && input.image !== undefined && !isName(input.image)) {
        throw new ValidationError('image must be a non-empty string.');
    }
    assertSandboxEnv(input.env);
}

/** The error of a create that its signal stopped. */
export function abortedCreate(cause?: unknown): SandboxError {
    return new SandboxError('workspace creation aborted', cause === undefined ? undefined : { cause });
}

/** An `image` option is undefined or a non-empty string without NUL; InvalidAgentDefinitionError otherwise. */
export function assertImageOption(image: unknown): void {
    if (image !== undefined && !isName(image)) {
        throw new InvalidAgentDefinitionError('image must be a non-empty string.');
    }
}

/** A `clock` option is undefined or an IClock; InvalidAgentDefinitionError otherwise. */
export function assertClockOption(clock: unknown): void {
    if (clock !== undefined && (!isObject(clock) || typeof clock.now !== 'function' || typeof clock.setTimeout !== 'function')) {
        throw new InvalidAgentDefinitionError('clock must be an IClock.');
    }
}

/**
 * The info of a workspace `provider` creates for `input` at `createdAt`:
 * it expires `timeoutMs` later and names the requested repo and ref.
 */
export function buildWorkspaceInfo(
    input: WorkspaceCreateOptions,
    provider: string,
    createdAt: Date,
    timeoutMs: number,
): WorkspaceInfo {
    const info: WorkspaceInfo = {
        runId: input.runId,
        provider,
        createdAt,
        expiresAt: new Date(createdAt.getTime() + timeoutMs),
    };
    if (input.repo !== undefined) info.repo = input.repo;
    if (input.ref !== undefined) info.ref = input.ref;
    return info;
}

/** True when an `EXPIRES_AT_KEY` value (epoch ms as a string) is at or before `now`. */
export function isExpiredAt(value: string | undefined, now: number): boolean {
    const expiresAt = Number(value);
    return !!value && Number.isFinite(expiresAt) && expiresAt <= now;
}

/**
 * One SandboxError for the removals a garbage collection could not do (the
 * others went on): the count, the first message, every failure in the cause.
 */
export function collectionError(count: number, failures: readonly unknown[]): SandboxError {
    const [first] = failures;
    const message = first instanceof Error ? first.message : String(first);
    return new SandboxError(
        `garbage collection removed ${count} workspaces, ${failures.length} failed (first: ${message})`,
        { cause: new AggregateError(failures) },
    );
}
