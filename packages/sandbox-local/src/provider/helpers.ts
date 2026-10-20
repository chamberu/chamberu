/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { constants } from 'node:os';
import { join } from 'node:path';
import { SandboxError, ValidationError } from '@chamberu/core';
import { SANDBOX_ENV, WORKSPACE_ROOT } from '@chamberu/sandbox';
import { FALLBACK_PATH } from './constants.ts';

/** Kills the process group led by `pid`. Best effort: a gone group (ESRCH) is fine. */
export function killGroup(pid: number): void {
    try {
        process.kill(-pid, 'SIGKILL');
    } catch {
        // ESRCH: the group is gone already
    }
}

/** The exit code a shell reports: the code, or 128 + the signal number. */
export function exitCodeOf(code: number | null, signal: NodeJS.Signals | null): number {
    if (code !== null) return code;
    const number = signal ? constants.signals[signal] : undefined;
    return 128 + (number ?? 0);
}

/**
 * The whole environment of a local exec: the host PATH, `SANDBOX_ENV`
 * without its container-only entries (HOME and `safe.directory`), HOME and
 * TMPDIR inside the workspace folder, then the configured `env`.
 */
export function buildEnv(dir: string, env: Record<string, string>): Record<string, string> {
    const base: Record<string, string> = { PATH: process.env.PATH || FALLBACK_PATH };
    for (const [key, value] of Object.entries(SANDBOX_ENV)) {
        if (key === 'HOME' || (key.startsWith('GIT_CONFIG_') && key !== 'GIT_CONFIG_NOSYSTEM')) continue;
        base[key] = value;
    }
    return {
        ...base,
        HOME: join(dir, 'home'),
        TMPDIR: join(dir, 'tmp'),
        ...env,
    };
}

/** `argv` is a non-empty list of strings without NUL, the first one non-empty. */
export function assertArgv(argv: readonly string[]): void {
    if (
        !Array.isArray(argv) ||
        argv.length === 0 ||
        argv[0] === '' ||
        argv.some((arg) => !(typeof arg === 'string' && !arg.includes('\0')))
    ) {
        throw new ValidationError('argv must be a non-empty list of strings without NUL, starting with the command.');
    }
}

/** How the model names a workspace-relative path. */
export function displayPath(relative: string): string {
    return relative === '.' ? WORKSPACE_ROOT : `${WORKSPACE_ROOT}/${relative}`;
}

export function errnoCode(error: unknown): string | undefined {
    const { code } = (error ?? {}) as { code?: unknown };
    return typeof code === 'string' ? code : undefined;
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
