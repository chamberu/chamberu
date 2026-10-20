/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Writable } from 'node:stream';
import { createOutputCollector } from '@chamberu/sandbox';
import type {
    IExecTransport,
    IOutputCollector,
    TransportExecOptions,
    TransportExecResult,
} from '@chamberu/sandbox';
import type { IPodClient } from '../client/types.ts';

/** Kubernetes exec has no working directory: a shell changes into it, then execs argv. */
const CD_SCRIPT = 'cd -- "$1" && shift && exec "$@"';

/** A sink that hands every chunk to the collector and never applies backpressure. */
function collectorSink(collector: IOutputCollector): Writable {
    return new Writable({
        write(chunk: Uint8Array, _encoding, callback) {
            collector.write(chunk);
            callback();
        },
    });
}

/**
 * Runs argv in a workspace pod's container through the pod client: stdout
 * and stderr into capped collectors (drained past the cap). The signal
 * closes the socket and detaches: the process runs on until its `timeout`
 * wrapper fires or the pod is deleted.
 */
export function createPodTransport(client: IPodClient, name: string): IExecTransport {
    return {
        async exec(argv: readonly string[], options: TransportExecOptions): Promise<TransportExecResult> {
            const stdout = createOutputCollector(options.maxOutputBytes);
            const stderr = createOutputCollector(options.maxOutputBytes);
            const { exitCode } = await client.exec(name, {
                argv: ['sh', '-c', CD_SCRIPT, 'sh', options.cwd, ...argv],
                ...(options.stdin === undefined ? {} : { stdin: options.stdin }),
                stdout: collectorSink(stdout),
                stderr: collectorSink(stderr),
                signal: options.signal,
            });
            return {
                exitCode,
                stdout: stdout.bytes(),
                stderr: stderr.bytes(),
                stdoutTruncated: stdout.truncated,
                stderrTruncated: stderr.truncated,
            };
        },

        remove: () => client.delete(name),
    };
}
