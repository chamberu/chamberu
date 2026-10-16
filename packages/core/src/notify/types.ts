export interface Notification {
    kind: 'approval' | 'stuck' | 'result' | 'info';
    agent: string;
    runId: string;
    title: string;
    body: string;
    /** Signed token resuming the run (kind 'approval'). */
    resumeToken?: string;
    expiresAt?: Date;
}

export interface Notifier {
    readonly name: string;
    /**
     * Delivers a notification. `idempotencyKey` is stable per logical
     * notification (`runId:approvalId` for approvals), so transports can dedupe.
     */
    notify(n: Notification, opts: { idempotencyKey: string }): Promise<void>;
}
