/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ValidationError } from '@chamberu/core';
import { completeLength } from '../output/helpers.ts';
import { WORKSPACE_ROOT } from '../workspace/constants.ts';
import { ERROR_STDERR_MAX_LENGTH, TIMEOUT_KILL_AFTER_SECONDS } from './constants.ts';

/**
 * `argv` behind GNU `timeout -k 5 <seconds>`, which signals the command's
 * whole process group. Seconds of the timeout rounded up to whole
 * milliseconds, without trailing zeros (`1500` -> `'1.5'`).
 */
export function wrapTimeout(argv: readonly string[], timeoutMs: number): string[] {
    return [
        'timeout',
        '-k',
        String(TIMEOUT_KILL_AFTER_SECONDS),
        String(Math.ceil(timeoutMs) / 1000),
        ...argv,
    ];
}

/**
 * Whether `timeout` ended the command: exit 124 (TERM) or 137 (KILL after
 * the grace) once the timeout passed. A command exiting 124 by itself
 * before that is no timeout.
 */
export function isTimeoutExit(exitCode: number, durationMs: number, timeoutMs: number): boolean {
    return (exitCode === 124 || exitCode === 137) && durationMs >= timeoutMs;
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

/** The absolute path of a workspace-relative one (`'.'` is the root). */
export function toAbsolute(relative: string): string {
    return relative === '.' ? WORKSPACE_ROOT : `${WORKSPACE_ROOT}/${relative}`;
}

/**
 * At most `maxBytes` of `bytes` (a transport may return more) and whether
 * anything was cut.
 */
export function capOutput(
    bytes: Uint8Array,
    truncated: boolean,
    maxBytes: number,
): { bytes: Uint8Array; truncated: boolean } {
    if (bytes.length <= maxBytes) return { bytes, truncated };
    return { bytes: bytes.subarray(0, maxBytes), truncated: true };
}

/** UTF-8 text of `bytes`; a sequence the cap cut short is dropped. */
export function decodeOutput(bytes: Uint8Array, truncated: boolean): string {
    return new TextDecoder().decode(truncated ? bytes.subarray(0, completeLength(bytes)) : bytes);
}

/** The trimmed stderr of a failed command for an error message, at most `ERROR_STDERR_MAX_LENGTH`. */
export function stderrMessage(stderr: Uint8Array): string {
    return new TextDecoder().decode(stderr).trim().slice(0, ERROR_STDERR_MAX_LENGTH);
}

export function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
