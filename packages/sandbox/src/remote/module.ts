/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { SandboxError, ValidationError, systemClock } from '@chamberu/core';
import { toSandboxError } from '../manager/helpers.ts';
import { resolveWorkspacePath } from '../path/module.ts';
import {
    EXEC_TIMEOUT_MAX_MS,
    EXEC_TIMEOUT_MS,
    FILE_MAX_BYTES,
    OUTPUT_MAX_BYTES,
    WORKSPACE_ROOT,
} from '../workspace/constants.ts';
import type { ExecOptions, ExecResult, IWorkspace } from '../workspace/types.ts';
import { ALIVE_PROBE_TIMEOUT_MS, EXEC_GRACE_MS, WRITE_FILE_SCRIPT } from './constants.ts';
import {
    assertArgv,
    capOutput,
    decodeOutput,
    isTimeoutExit,
    stderrMessage,
    toAbsolute,
    wrapTimeout,
} from './helpers.ts';
import type { RemoteWorkspaceInput, TransportExecResult } from './types.ts';

type RunInput = {
    cwd: string;
    stdin?: Uint8Array;
    timeoutMs: number;
    maxOutputBytes: number;
    signal?: AbortSignal;
};

type RunResult = TransportExecResult & { timedOut: boolean; durationMs: number };

const EMPTY = new Uint8Array(0);

/**
 * A workspace in a container or pod, reached through `transport`. Every
 * command runs behind GNU `timeout`; a client-side guard stops waiting at
 * the timeout plus `EXEC_GRACE_MS` and reports exit 137. An abort only
 * detaches (the command runs on until its `timeout` or the dispose); a
 * dispose settles every in-flight exec with `SandboxError('workspace
 * disposed')` and removes the container or pod; a dispose after a failed
 * removal tries it again. A failed exec asks `transport.alive`: a container
 * or pod that no longer runs marks the workspace gone (`disposed`).
 */
export function createRemoteWorkspace(input: RemoteWorkspaceInput): IWorkspace {
    const {
        id,
        info,
        transport,
    } = input;
    const clock = input.clock ?? systemClock;
    const disposal = new AbortController();
    let disposed = false;
    let gone = false;
    let removing: Promise<void> | undefined;

    const goneMessage = (detail?: string): string => `workspace ${id} is gone (its container or pod stopped or was removed` +
        `${detail ? `: ${detail}` : ''}); call create_workspace for a new one.`;

    const assertUsable = () => {
        if (disposed) {
            throw new SandboxError('workspace disposed');
        }
        if (gone) {
            throw new SandboxError(goneMessage());
        }
        if (clock.now().getTime() >= info.expiresAt.getTime()) {
            throw new SandboxError('workspace expired');
        }
    };

    /** The requested timeout (default `EXEC_TIMEOUT_MS`), at most `EXEC_TIMEOUT_MAX_MS` and never past the expiry. */
    const timeoutOf = (requested: number | undefined): number => {
        if (requested !== undefined && (typeof requested !== 'number' || !Number.isFinite(requested) || requested <= 0)) {
            throw new ValidationError('timeoutMs must be a positive number.');
        }
        const remaining = info.expiresAt.getTime() - clock.now().getTime();
        return Math.max(1, Math.min(requested ?? EXEC_TIMEOUT_MS, EXEC_TIMEOUT_MAX_MS, remaining));
    };

    /** `transport.alive`, bounded by ALIVE_PROBE_TIMEOUT_MS; anything but a plain `false` reads as alive. */
    const probeAlive = (): Promise<boolean> => {
        const { alive } = transport;
        if (!alive) return Promise.resolve(true);
        const controller = new AbortController();
        return new Promise<boolean>((resolve) => {
            const timer = clock.setTimeout(() => {
                controller.abort();
                resolve(true);
            }, ALIVE_PROBE_TIMEOUT_MS);
            const answer = (value: boolean) => {
                timer.clear();
                resolve(value);
            };
            Promise.resolve()
                .then(() => alive.call(transport, controller.signal))
                .then((value) => answer(value !== false), () => answer(true));
        });
    };

    const run = (argv: readonly string[], options: RunInput): Promise<RunResult> => {
        const { signal, timeoutMs } = options;
        if (signal?.aborted) {
            return Promise.reject(new SandboxError('exec aborted'));
        }

        const started = clock.now().getTime();
        const guard = new AbortController();
        const combined = AbortSignal.any(signal ?
            [guard.signal, disposal.signal, signal] :
            [guard.signal, disposal.signal]);

        return new Promise<RunResult>((resolve, reject) => {
            let settled = false;
            const timer = clock.setTimeout(() => guard.abort(), timeoutMs + EXEC_GRACE_MS);

            const finish = (): boolean => {
                if (settled) return false;
                settled = true;
                timer.clear();
                combined.removeEventListener('abort', onAbort);
                return true;
            };
            /** Settles by precedence: disposed, then aborted, then the guard. */
            const interrupted = (): boolean => {
                if (disposal.signal.aborted) {
                    reject(new SandboxError('workspace disposed'));
                    return true;
                }
                if (signal?.aborted) {
                    reject(new SandboxError('exec aborted'));
                    return true;
                }
                if (guard.signal.aborted) {
                    resolve({
                        exitCode: 137,
                        stdout: EMPTY,
                        stderr: EMPTY,
                        stdoutTruncated: false,
                        stderrTruncated: false,
                        timedOut: true,
                        durationMs: clock.now().getTime() - started,
                    });
                    return true;
                }
                return false;
            };
            function onAbort() {
                if (finish()) interrupted();
            }
            combined.addEventListener('abort', onAbort, { once: true });

            let pending: Promise<TransportExecResult>;
            try {
                pending = transport.exec(wrapTimeout(argv, timeoutMs), {
                    cwd: options.cwd,
                    stdin: options.stdin,
                    maxOutputBytes: options.maxOutputBytes,
                    signal: combined,
                });
            } catch (error) {
                pending = Promise.reject(error);
            }

            pending.then((result) => {
                if (!finish() || interrupted()) return;
                const durationMs = clock.now().getTime() - started;
                const stdout = capOutput(result.stdout, result.stdoutTruncated, options.maxOutputBytes);
                const stderr = capOutput(result.stderr, result.stderrTruncated, options.maxOutputBytes);
                resolve({
                    exitCode: result.exitCode,
                    stdout: stdout.bytes,
                    stderr: stderr.bytes,
                    stdoutTruncated: stdout.truncated,
                    stderrTruncated: stderr.truncated,
                    timedOut: isTimeoutExit(result.exitCode, durationMs, timeoutMs),
                    durationMs,
                });
            }, (error: unknown) => {
                if (!finish() || interrupted()) return;
                const failure = toSandboxError(error, 'exec failed');
                probeAlive().then((alive) => {
                    if (disposed) {
                        reject(new SandboxError('workspace disposed'));
                    } else if (alive) {
                        reject(failure);
                    } else {
                        gone = true;
                        reject(new SandboxError(goneMessage(failure.message), { cause: error }));
                    }
                });
            });
        });
    };

    return {
        id,
        info,

        get disposed() {
            return disposed || gone;
        },

        async exec(argv: readonly string[], options: ExecOptions = {}): Promise<ExecResult> {
            assertUsable();
            assertArgv(argv);
            const cwd = toAbsolute(options.cwd === undefined ? '.' : resolveWorkspacePath(options.cwd));
            if (options.stdin !== undefined && typeof options.stdin !== 'string') {
                throw new ValidationError('stdin must be a string.');
            }
            const timeoutMs = timeoutOf(options.timeoutMs);

            const result = await run(argv, {
                cwd,
                stdin: options.stdin === undefined ? undefined : new TextEncoder().encode(options.stdin),
                timeoutMs,
                maxOutputBytes: OUTPUT_MAX_BYTES,
                signal: options.signal,
            });
            return {
                exitCode: result.exitCode,
                stdout: decodeOutput(result.stdout, result.stdoutTruncated),
                stderr: decodeOutput(result.stderr, result.stderrTruncated),
                stdoutTruncated: result.stdoutTruncated,
                stderrTruncated: result.stderrTruncated,
                timedOut: result.timedOut,
                durationMs: result.durationMs,
            };
        },

        async readFile(path: string): Promise<string> {
            assertUsable();
            const relative = resolveWorkspacePath(path);
            if (relative === '.') {
                throw new SandboxError(`${WORKSPACE_ROOT} is no file.`);
            }
            const file = toAbsolute(relative);

            // one byte past the limit tells an oversized file apart
            const result = await run(['cat', '--', file], {
                cwd: WORKSPACE_ROOT,
                timeoutMs: timeoutOf(undefined),
                maxOutputBytes: FILE_MAX_BYTES + 1,
            });
            if (result.timedOut) {
                throw new SandboxError(`cannot read ${file}: timed out.`);
            }
            if (result.exitCode !== 0) {
                const stderr = stderrMessage(result.stderr);
                if (stderr.endsWith('No such file or directory')) {
                    throw new SandboxError(`file not found: ${file}`);
                }
                throw new SandboxError(`cannot read ${file}: cat exited with ${result.exitCode}${stderr ? `: ${stderr}` : ''}`);
            }
            if (result.stdoutTruncated || result.stdout.length > FILE_MAX_BYTES) {
                throw new SandboxError(`${file} is larger than the ${FILE_MAX_BYTES} bytes a file may have.`);
            }
            return new TextDecoder().decode(result.stdout);
        },

        async writeFile(path: string, content: string): Promise<void> {
            assertUsable();
            const relative = resolveWorkspacePath(path);
            if (relative === '.') {
                throw new ValidationError('path must name a file, not the workspace root.');
            }
            if (typeof content !== 'string') {
                throw new ValidationError('content must be a string.');
            }
            const bytes = new TextEncoder().encode(content);
            if (bytes.length > FILE_MAX_BYTES) {
                throw new ValidationError(`content has ${bytes.length} bytes, more than the ${FILE_MAX_BYTES} a file may have.`);
            }

            const file = toAbsolute(relative);
            const result = await run(['sh', '-c', WRITE_FILE_SCRIPT, 'sh', file, String(bytes.length)], {
                cwd: WORKSPACE_ROOT,
                stdin: bytes,
                timeoutMs: timeoutOf(undefined),
                maxOutputBytes: OUTPUT_MAX_BYTES,
            });
            if (result.timedOut) {
                throw new SandboxError(`cannot write ${file}: timed out.`);
            }
            if (result.exitCode !== 0) {
                const stderr = stderrMessage(result.stderr);
                throw new SandboxError(`cannot write ${file}: exited with ${result.exitCode}${stderr ? `: ${stderr}` : ''}`);
            }
        },

        dispose(): Promise<void> {
            // settles every in-flight exec before the container goes
            disposed = true;
            disposal.abort();
            removing ??= Promise.resolve()
                .then(() => transport.remove())
                .catch((error: unknown) => {
                    // a later dispose tries the removal again
                    removing = undefined;
                    throw toSandboxError(error, `cannot remove workspace ${id}`);
                });
            return removing;
        },
    };
}
