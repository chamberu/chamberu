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
            body: JSON.stringify(n),
        });
        // throw on failure: the engine retries the approval notification on the next poll
        if (!response.ok) throw new Error(`Notification failed with ${response.status}.`);
    }
}
// #endregion webhook
