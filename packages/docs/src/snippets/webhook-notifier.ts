import type { INotifier, Notification, NotifyOptions } from '@chamvi/core';

// #region webhook
export class WebhookNotifier implements INotifier {
    readonly name = 'webhook';

    constructor(protected readonly url: string) {}

    async notify(n: Notification, opts: NotifyOptions): Promise<void> {
        const response = await fetch(this.url, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'idempotency-key': opts.idempotencyKey,
            },
            // never forward n.resumeToken: send the approval id and a UI link, the owner answers signed in
            body: JSON.stringify({
                kind: n.kind,
                agent: n.agent,
                runId: n.runId,
                title: n.title,
                body: n.body,
                approvalId: n.approvalId,
                expiresAt: n.expiresAt,
                link: n.approvalId ?
                    `https://chamvi.example/ui/approvals?run=${n.runId}&approval=${n.approvalId}` :
                    undefined,
            }),
        });
        // throw on failure: the engine retries the approval notification on the next poll
        if (!response.ok) throw new Error(`Notification failed with ${response.status}.`);
    }
}
// #endregion webhook
