import type { INotifier, Notification, NotifyOptions } from '@chamvi/core';

// #region console
export class ConsoleNotifier implements INotifier {
    readonly name = 'console';

    async notify(n: Notification, opts: NotifyOptions): Promise<void> {
        console.log(`[${n.kind}] ${n.title} (${opts.idempotencyKey})`);
        console.log(n.body);
        // development only: the token approves the call, keep it out of shared logs
        if (n.resumeToken) console.log(`resume token: ${n.resumeToken}`);
    }
}
// #endregion console
