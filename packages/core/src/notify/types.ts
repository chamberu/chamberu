/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export type Notification = {
    kind: 'approval' | 'stuck' | 'result' | 'info';
    agent: string;
    runId: string;
    title: string;
    body: string;
    /** Signed token resuming the run (kind 'approval'). */
    resumeToken?: string;
    expiresAt?: Date;
};

export interface INotifier {
    readonly name: string;
    /**
     * Delivers a notification. `idempotencyKey` is stable per logical
     * notification (`runId:approvalId` for approvals), so transports can dedupe.
     */
    notify(n: Notification, opts: { idempotencyKey: string }): Promise<void>;
}
