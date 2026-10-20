/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    IExecTransport,
    TransportExecOptions,
    TransportExecResult,
} from '@chamberu/sandbox';

export type FakeTransportHandler = (
    argv: readonly string[],
    options: TransportExecOptions,
) => Partial<TransportExecResult> | Promise<Partial<TransportExecResult>>;

export type FakeTransport = IExecTransport & {
    calls: Array<{ argv: string[]; options: TransportExecOptions }>;
    /** How often remove() was called. */
    removed: number;
    /** The next remove() rejects with `error`. */
    failNextRemove(error: Error): void;
};

/**
 * A transport whose exec answers come from `handler` (default: exit 0, no
 * output); every call is recorded. A handler may advance a clock to
 * simulate duration, or return a promise that never settles.
 */
export function createFakeTransport(handler: FakeTransportHandler = () => ({})): FakeTransport {
    let nextRemoveError: Error | undefined;
    const transport: FakeTransport = {
        calls: [],
        removed: 0,
        failNextRemove(error) {
            nextRemoveError = error;
        },
        async exec(argv, options) {
            transport.calls.push({ argv: [...argv], options });
            const result = await handler(argv, options);
            return {
                exitCode: 0,
                stdout: new Uint8Array(0),
                stderr: new Uint8Array(0),
                stdoutTruncated: false,
                stderrTruncated: false,
                ...result,
            };
        },
        async remove() {
            transport.removed++;
            if (nextRemoveError) {
                const error = nextRemoveError;
                nextRemoveError = undefined;
                throw error;
            }
        },
    };
    return transport;
}
