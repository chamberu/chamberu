/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { EventEmitter } from 'node:events';
import type { Env } from '@chamvi/app';
import { ControllableClock } from '@chamvi/test-kit';
import type { CliContext } from '../../src/run/types.ts';
import type { ISignalTarget } from '../../src/signals/types.ts';

export type FakeProcess = {
    /** An EventEmitter-backed signal target: `emit('SIGTERM')` delivers a signal. */
    signals: ISignalTarget & { emit(signal: 'SIGTERM' | 'SIGINT'): void; listenerCount(signal: string): number };
    clock: ControllableClock;
    /** Every setExitCode call, in order. */
    exitCodes: number[];
    /** Every exit call, in order. */
    exits: number[];
    stdout: string[];
    stderr: string[];
    /** The CliContext over this process (env, cwd and importModule as given). */
    context(input?: { env?: Env; cwd?: string }): Partial<CliContext>;
};

export function createFakeProcess(): FakeProcess {
    const emitter = new EventEmitter();
    const clock = new ControllableClock();
    const exitCodes: number[] = [];
    const exits: number[] = [];
    const stdout: string[] = [];
    const stderr: string[] = [];

    const signals: FakeProcess['signals'] = {
        on(signal, fn) {
            emitter.on(signal, fn);
        },
        off(signal, fn) {
            emitter.off(signal, fn);
        },
        emit(signal) {
            emitter.emit(signal);
        },
        listenerCount(signal) {
            return emitter.listenerCount(signal);
        },
    };

    return {
        signals,
        clock,
        exitCodes,
        exits,
        stdout,
        stderr,
        context(input = {}) {
            return {
                cwd: input.cwd ?? process.cwd(),
                env: input.env ?? {},
                clock,
                signals,
                setExitCode: (code) => {
                    exitCodes.push(code);
                },
                exit: (code) => {
                    exits.push(code);
                },
                stdout: (text) => {
                    stdout.push(text);
                },
                stderr: (text) => {
                    stderr.push(text);
                },
            };
        },
    };
}
