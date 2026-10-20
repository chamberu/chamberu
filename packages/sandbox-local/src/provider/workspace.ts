/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import {
    mkdir,
    open,
    rm,
    stat,
    writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { IClock } from '@chamberu/core';
import { SandboxError, ValidationError } from '@chamberu/core';
import {
    EXEC_TIMEOUT_MAX_MS,
    EXEC_TIMEOUT_MS,
    FILE_MAX_BYTES,
    OUTPUT_MAX_BYTES,
    createOutputCollector,
    resolveWorkspacePath,
} from '@chamberu/sandbox';
import type {
    ExecOptions,
    ExecResult,
    IWorkspace,
    WorkspaceInfo,
} from '@chamberu/sandbox';
import { KILL_GRACE_MS, REPO_DIR } from './constants.ts';
import {
    assertArgv,
    displayPath,
    errnoCode,
    exitCodeOf,
    killGroup,
} from './helpers.ts';
import type { LocalWorkspaceInput } from './types.ts';

type LiveExec = { fail(error: SandboxError): void };

/**
 * A workspace in a host directory. Each exec is its own process group
 * (`detached`), so a timeout, an abort or a dispose kills every process the
 * command started. A command that exits while a background job of it holds
 * its output settles `KILL_GRACE_MS` later with its own exit code; the job
 * runs on until the dispose, as on Docker and Kubernetes. No isolation: the
 * command runs as the host user.
 */
export class LocalWorkspace implements IWorkspace {
    readonly id: string;

    readonly info: WorkspaceInfo;

    protected readonly dir: string;

    protected readonly root: string;

    protected readonly env: Record<string, string>;

    protected readonly clock: IClock;

    protected readonly onDispose: () => void;

    protected readonly live = new Set<LiveExec>();

    /** Process groups of finished execs whose background jobs held the output; the dispose kills them. */
    protected readonly lingering = new Set<number>();

    protected disposing: Promise<void> | undefined;

    /** Set once the workspace directory was found missing (removed outside chamberu). */
    protected gone = false;

    constructor(input: LocalWorkspaceInput) {
        this.id = input.id;
        this.info = input.info;
        this.dir = input.dir;
        this.root = join(input.dir, REPO_DIR);
        this.env = input.env;
        this.clock = input.clock;
        this.onDispose = input.onDispose;
    }

    get disposed(): boolean {
        return this.disposing !== undefined || this.gone;
    }

    async exec(argv: readonly string[], options: ExecOptions = {}): Promise<ExecResult> {
        this.assertUsable();
        assertArgv(argv);
        const cwd = options.cwd === undefined ? '.' : resolveWorkspacePath(options.cwd);
        if (options.stdin !== undefined && typeof options.stdin !== 'string') {
            throw new ValidationError('stdin must be a string.');
        }
        const timeoutMs = this.timeoutOf(options.timeoutMs);
        if (options.signal?.aborted) {
            throw new SandboxError('exec aborted');
        }

        const directory = join(this.root, cwd);
        const stats = await stat(directory).catch(() => undefined);
        if (!stats?.isDirectory()) {
            await this.assertRoot();
            throw new SandboxError(`cwd ${displayPath(cwd)} is no directory in the workspace.`);
        }
        this.assertUsable();

        return this.run(argv, directory, timeoutMs, options);
    }

    async readFile(path: string): Promise<string> {
        this.assertUsable();
        const relative = resolveWorkspacePath(path);
        const shown = displayPath(relative);
        const file = join(this.root, relative);

        let size: number;
        try {
            const stats = await stat(file);
            if (!stats.isFile()) throw new SandboxError(`${shown} is no file.`);
            ({ size } = stats);
        } catch (error) {
            if (error instanceof SandboxError) throw error;
            const code = errnoCode(error);
            if (code === 'ENOENT' || code === 'ENOTDIR') {
                await this.assertRoot();
                throw new SandboxError(`file not found: ${shown}`);
            }
            throw new SandboxError(`cannot read ${shown} (${code ?? 'unknown error'}).`, { cause: error });
        }
        if (size > FILE_MAX_BYTES) {
            throw new SandboxError(`${shown} has ${size} bytes, more than the ${FILE_MAX_BYTES} a file may have.`);
        }

        // read at most one byte past the limit: the file may grow after the stat
        const buffer = Buffer.alloc(FILE_MAX_BYTES + 1);
        let length = 0;
        try {
            const handle = await open(file, 'r');
            try {
                while (length < buffer.length) {
                    const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
                    if (bytesRead === 0) break;
                    length += bytesRead;
                }
            } finally {
                await handle.close();
            }
        } catch (error) {
            throw new SandboxError(`cannot read ${shown} (${errnoCode(error) ?? 'unknown error'}).`, { cause: error });
        }
        if (length > FILE_MAX_BYTES) {
            throw new SandboxError(`${shown} has more than the ${FILE_MAX_BYTES} bytes a file may have.`);
        }

        return buffer.toString('utf8', 0, length);
    }

    async writeFile(path: string, content: string): Promise<void> {
        this.assertUsable();
        const relative = resolveWorkspacePath(path);
        if (relative === '.') {
            throw new ValidationError('path must name a file, not the workspace root.');
        }
        if (typeof content !== 'string') {
            throw new ValidationError('content must be a string.');
        }
        const size = Buffer.byteLength(content, 'utf8');
        if (size > FILE_MAX_BYTES) {
            throw new ValidationError(`content has ${size} bytes, more than the ${FILE_MAX_BYTES} a file may have.`);
        }

        const file = join(this.root, relative);
        // mkdir would bring a removed workspace directory back
        await this.assertRoot();
        try {
            await mkdir(dirname(file), { recursive: true });
            await writeFile(file, content, 'utf8');
        } catch (error) {
            throw new SandboxError(`cannot write ${displayPath(relative)} (${errnoCode(error) ?? 'unknown error'}).`, { cause: error });
        }
    }

    dispose(): Promise<void> {
        this.disposing ??= this.remove();
        return this.disposing;
    }

    protected async remove(): Promise<void> {
        for (const entry of [...this.live]) {
            entry.fail(new SandboxError('workspace disposed'));
        }
        for (const pid of this.lingering) killGroup(pid);
        this.lingering.clear();
        this.onDispose();
        try {
            await rm(this.dir, {
                recursive: true,
                force: true,
                maxRetries: 3,
            });
        } catch (error) {
            throw new SandboxError(`cannot remove workspace ${this.id} (${errnoCode(error) ?? 'unknown error'}).`, { cause: error });
        }
    }

    protected assertUsable(): void {
        if (this.disposing) {
            throw new SandboxError('workspace disposed');
        }
        if (this.gone) {
            throw new SandboxError(this.goneMessage());
        }
        if (this.clock.now().getTime() >= this.info.expiresAt.getTime()) {
            throw new SandboxError('workspace expired');
        }
    }

    /** Marks the workspace gone and throws when its directory no longer exists. */
    protected async assertRoot(): Promise<void> {
        const stats = await stat(this.root).catch(() => undefined);
        if (stats?.isDirectory() || this.disposing) return;
        this.gone = true;
        throw new SandboxError(this.goneMessage());
    }

    protected goneMessage(): string {
        return `workspace ${this.id} is gone (its directory was removed); call create_workspace for a new one.`;
    }

    /** The requested timeout (default `EXEC_TIMEOUT_MS`), at most `EXEC_TIMEOUT_MAX_MS` and never past the expiry. */
    protected timeoutOf(requested: number | undefined): number {
        if (requested !== undefined && (typeof requested !== 'number' || !Number.isFinite(requested) || requested <= 0)) {
            throw new ValidationError('timeoutMs must be a positive number.');
        }
        const remaining = this.info.expiresAt.getTime() - this.clock.now().getTime();
        return Math.max(1, Math.min(requested ?? EXEC_TIMEOUT_MS, EXEC_TIMEOUT_MAX_MS, remaining));
    }

    protected run(
        argv: readonly string[],
        cwd: string,
        timeoutMs: number,
        options: ExecOptions,
    ): Promise<ExecResult> {
        return new Promise<ExecResult>((resolve, reject) => {
            const started = this.clock.now().getTime();
            const stdout = createOutputCollector(OUTPUT_MAX_BYTES);
            const stderr = createOutputCollector(OUTPUT_MAX_BYTES);
            const { signal } = options;

            let child: ChildProcess;
            try {
                child = spawn(argv[0] as string, argv.slice(1), {
                    cwd,
                    env: this.env,
                    detached: true,
                    stdio: 'pipe',
                });
            } catch (error) {
                reject(new SandboxError(`cannot start ${argv[0]}.`, { cause: error }));
                return;
            }

            let settled = false;
            let timedOut = false;
            let killTimer: { clear(): void } | undefined;
            let graceTimer: { clear(): void } | undefined;
            let pipeTimer: { clear(): void } | undefined;

            const kill = () => {
                if (child.pid !== undefined) killGroup(child.pid);
            };
            const closePipes = () => {
                child.stdin?.destroy();
                child.stdout?.destroy();
                child.stderr?.destroy();
            };
            const finish = (): boolean => {
                if (settled) return false;
                settled = true;
                killTimer?.clear();
                graceTimer?.clear();
                pipeTimer?.clear();
                signal?.removeEventListener('abort', onAbort);
                this.live.delete(entry);
                return true;
            };
            const entry: LiveExec = {
                fail: (error) => {
                    if (!finish()) return;
                    kill();
                    closePipes();
                    reject(error);
                },
            };
            function onAbort() {
                entry.fail(new SandboxError('exec aborted'));
            }
            const result = (exitCode: number, stderrText: string): ExecResult => ({
                exitCode,
                stdout: stdout.text(),
                stderr: stderrText,
                stdoutTruncated: stdout.truncated,
                stderrTruncated: stderr.truncated,
                timedOut,
                durationMs: this.clock.now().getTime() - started,
            });

            this.live.add(entry);
            signal?.addEventListener('abort', onAbort, { once: true });

            child.stdout?.on('data', (chunk: Uint8Array) => stdout.write(chunk));
            child.stderr?.on('data', (chunk: Uint8Array) => stderr.write(chunk));
            // a child that never reads its stdin closes the pipe (EPIPE)
            child.stdin?.on('error', () => undefined);
            child.stdin?.end(options.stdin ?? '');

            child.on('error', (error) => {
                if (child.pid !== undefined) return;
                // the command could not start
                if (!finish()) return;
                closePipes();
                const code = errnoCode(error);
                if (code === 'ENOENT') {
                    resolve(result(127, `${argv[0]}: command not found\n`));
                } else if (code === 'EACCES') {
                    resolve(result(126, `${argv[0]}: permission denied\n`));
                } else {
                    reject(new SandboxError(`cannot start ${argv[0]} (${code ?? 'unknown error'}).`, { cause: error }));
                }
            });

            child.on('exit', () => {
                if (settled || timedOut) return;
                // the command finished on its own: no timeout any more, but a
                // background job it started may hold the pipes open
                killTimer?.clear();
                pipeTimer = this.clock.setTimeout(() => {
                    if (child.pid !== undefined) this.lingering.add(child.pid);
                    closePipes();
                }, KILL_GRACE_MS);
            });

            child.on('close', (code, closeSignal) => {
                if (!finish()) return;
                resolve(result(exitCodeOf(code, closeSignal), stderr.text()));
            });

            killTimer = this.clock.setTimeout(() => {
                timedOut = true;
                kill();
                // a process that left the group may hold the pipes open
                graceTimer = this.clock.setTimeout(closePipes, KILL_GRACE_MS);
            }, timeoutMs);
        });
    }
}
