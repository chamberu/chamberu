import type { INotifier, Notification } from '@chamberu/core';

// #region console
export class ConsoleNotifier implements INotifier {
    readonly name = 'console';

    async notify(n: Notification, opts: { idempotencyKey: string }): Promise<void> {
        console.log(`[${n.kind}] ${n.title} (${opts.idempotencyKey})`);
        console.log(n.body);
        if (n.resumeToken) console.log(`resume token: ${n.resumeToken}`);
    }
}
// #endregion console
