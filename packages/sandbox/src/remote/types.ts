/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock } from '@chamberu/core';
import type { WorkspaceInfo } from '../workspace/types.ts';

export type TransportExecOptions = {
    /** Absolute inside the container, under `WORKSPACE_ROOT`. */
    cwd: string;
    stdin?: Uint8Array;
    /** Cap per output stream; the transport keeps draining past it. */
    maxOutputBytes: number;
    /** Aborted on a caller abort, a dispose or the client-side guard: stop waiting and detach. */
    signal: AbortSignal;
};

export type TransportExecResult = {
    exitCode: number;
    stdout: Uint8Array;
    stderr: Uint8Array;
    stdoutTruncated: boolean;
    stderrTruncated: boolean;
};

/**
 * Runs argv in one container or pod. The remote workspace wraps argv in
 * GNU `timeout` itself; a transport only executes and collects.
 */
export interface IExecTransport {
    /** A command that cannot start reports exit 127. */
    exec(argv: readonly string[], options: TransportExecOptions): Promise<TransportExecResult>;
    /**
     * Whether the container or pod still runs; asked after a failed exec. False
     * marks the workspace gone. A rejection, or no answer within
     * `ALIVE_PROBE_TIMEOUT_MS` (the signal then aborts), reads as alive.
     */
    alive?(signal: AbortSignal): Promise<boolean>;
    /** Deletes the container or pod; idempotent, a missing one is fine. */
    remove(): Promise<void>;
}

export type RemoteWorkspaceInput = {
    /** `randomUUID()`. */
    id: string;
    /** A mutable object the provider owns (it sets `commit` after the checkout). */
    info: WorkspaceInfo;
    transport: IExecTransport;
    /** Default `systemClock`. */
    clock?: IClock;
};
