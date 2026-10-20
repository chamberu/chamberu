/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Duplex } from 'node:stream';
import type { IClock } from '@chamberu/core';
import { createOutputCollector } from '@chamberu/sandbox';
import type { IExecTransport, TransportExecOptions, TransportExecResult } from '@chamberu/sandbox';
import type Dockerode from 'dockerode';
import { SANDBOX_USER } from '../provider/constants.ts';
import { removeContainer } from '../provider/helpers.ts';
import { INSPECT_POLL_INITIAL_MS, INSPECT_POLL_MAX_MS } from './constants.ts';
import {
    abortError,
    collectorSink,
    delay,
    streamEnded,
} from './helpers.ts';

/**
 * Runs argv in a started workspace container through the Docker exec API:
 * stdout and stderr demultiplexed into capped collectors (drained past the
 * cap), stdin written and half-closed, then the exit code read from the exec
 * once it stopped (polled on the clock with backoff). The signal detaches:
 * the HTTP stream is dropped and the process runs on until its `timeout`
 * wrapper fires or the container is removed.
 */
export function createDockerTransport(
    docker: Dockerode,
    container: Dockerode.Container,
    clock: IClock,
): IExecTransport {
    return {
        async exec(argv: readonly string[], options: TransportExecOptions): Promise<TransportExecResult> {
            const { signal, stdin } = options;
            if (signal.aborted) throw abortError(signal);

            const exec = await container.exec({
                Cmd: [...argv],
                AttachStdout: true,
                AttachStderr: true,
                AttachStdin: stdin !== undefined,
                Tty: false,
                WorkingDir: options.cwd,
                User: SANDBOX_USER,
                abortSignal: signal,
            });
            const stream = await exec.start({
                hijack: true,
                stdin: stdin !== undefined,
                abortSignal: signal,
            }) as Duplex;

            const stdout = createOutputCollector(options.maxOutputBytes);
            const stderr = createOutputCollector(options.maxOutputBytes);
            const ended = streamEnded(stream, signal);
            docker.modem.demuxStream(stream, collectorSink(stdout), collectorSink(stderr));
            if (stdin !== undefined) {
                // after the demux listeners, so no output is lost; end() half-closes the socket (stdin EOF)
                stream.end(stdin);
            }
            await ended;

            let wait = INSPECT_POLL_INITIAL_MS;
            let info = await exec.inspect({ abortSignal: signal });
            while (info.Running) {
                await delay(clock, wait, signal);
                wait = Math.min(wait * 2, INSPECT_POLL_MAX_MS);
                info = await exec.inspect({ abortSignal: signal });
            }

            return {
                // a process that could not start reports no exit code
                exitCode: typeof info.ExitCode === 'number' ? info.ExitCode : 127,
                stdout: stdout.bytes(),
                stderr: stderr.bytes(),
                stdoutTruncated: stdout.truncated,
                stderrTruncated: stderr.truncated,
            };
        },

        remove: () => removeContainer(container),
    };
}
