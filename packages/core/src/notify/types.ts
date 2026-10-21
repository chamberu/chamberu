/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { TriggerEnvelope } from '../trigger/types.ts';

export type Notification = {
    kind: 'approval' | 'stuck' | 'result' | 'info';
    agent: string;
    runId: string;
    title: string;
    body: string;
    /** The wait point's approval id (kind 'approval'), e.g. for a link into the UI's approval. */
    approvalId?: string;
    /** Signed token resuming the run (kind 'approval'). */
    resumeToken?: string;
    expiresAt?: Date;
};

export type NotifyOptions = {
    /**
     * Stable per logical notification (`runId:approvalId` for approvals), so
     * transports can dedupe a resend.
     */
    idempotencyKey: string;
    /**
     * The run's trigger envelope as stored; read the source, payload and
     * receivedAt, never write it.
     */
    trigger: TriggerEnvelope;
};

export interface INotifier {
    readonly name: string;
    /**
     * Delivers a notification and throws on failure (the engine retries an
     * approval until one send succeeds), idempotent on `opts.idempotencyKey`.
     */
    notify(n: Notification, opts: NotifyOptions): Promise<void>;
}

export type ConsoleNotifierOptions = {
    /** Default `'console'`. */
    name?: string;
    /** Receives each line; default `console.log`. */
    write?: (line: string) => void;
};
