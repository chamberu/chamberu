/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** Takes the chunks of one output stream as they arrive. */
export interface IOutputSink {
    write(chunk: Uint8Array): void;
}

/**
 * Collects one output stream up to a byte cap. Writes past the cap are
 * counted and dropped (the reader keeps draining, so a full pipe never
 * blocks the child); at most the cap is held in memory.
 */
export interface IOutputCollector extends IOutputSink {
    /** True once more than the cap was written. */
    readonly truncated: boolean;
    /** At most the cap. */
    bytes(): Uint8Array;
    /** UTF-8; a character cut by the cap is dropped, never decoded as U+FFFD. */
    text(): string;
}
