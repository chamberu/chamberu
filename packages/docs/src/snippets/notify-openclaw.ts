import { Engine, MemoryStore } from '@chamvi/core';
import type { Agent } from '@chamvi/core';
import { openclaw } from '@chamvi/notify-openclaw';

export function createEngine(agents: Agent[]) {
    // #region notifier
    const notifier = openclaw({
        // the OpenClaw gateway, reachable from the app
        baseUrl: 'http://openclaw:18789',
        // OpenClaw's hooks.token, not the gateway token
        hooksToken: process.env.OPENCLAW_HOOKS_TOKEN ?? '',
        // placeholders: the channel and recipient of your OpenClaw setup
        deliver: { channel: '<channel>', to: '<recipient>' },
        // optional: a link into the UI's approvals inbox; the message carries the
        // token only inside it (resumeTool: true also adds a resume_run call)
        resumeUrl: (token) => `https://chamvi.example/ui/approvals?token=${encodeURIComponent(token)}`,
    });

    const engine = new Engine({
        store: new MemoryStore(),
        agents,
        // agents name it with notify: 'openclaw'
        notifiers: { openclaw: notifier },
        resumeSecret: process.env.RESUME_SECRET ?? '',
    });
    // #endregion notifier
    return engine;
}
