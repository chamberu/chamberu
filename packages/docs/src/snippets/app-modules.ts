// #region modules
// src/index.ts
import { createApp, defineAgent } from '@chamvi/app';
import { githubModule } from '@chamvi/github/module';
import { openclawModule } from '@chamvi/notify-openclaw/module';
import { sandboxModule } from '@chamvi/sandbox/module';
import { uiModule } from '@chamvi/ui/module';
import { codingTools } from '@chamvi/coding';
import { githubWebhook } from '@chamvi/github';

// every factory reads its env when it is called (GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, ...)
const github = githubModule();
// CHAMVI_SANDBOX_PROVIDER, when set, wins over the option
const sandbox = sandboxModule({
    provider: 'docker',
    allowRepo: (url) => url.startsWith('https://github.com/acme/'),
});

const repro = defineAgent({
    name: 'repro',
    model: 'anthropic:claude-sonnet-5-5',
    instructions: 'Reproduce the reported bug with a failing test and comment the result.',
    triggers: [githubWebhook({ events: ['issues.labeled'] })],
    // the instances exist at import time, before start()
    tools: {
        ...github.app.readTools(),
        ...sandbox.manager.tools(),
        ...codingTools(sandbox.manager),
    },
    approvals: { bash: 'user' },
    notify: 'openclaw',
});

export default createApp({
    agents: [repro],
    modules: [
        // POST /webhooks/github
        github,
        // attached to the engine on start, closed after the engine drained
        sandbox,
        // the notifier named 'openclaw', approval links from CHAMVI_PUBLIC_URL
        openclawModule(),
        // the dashboard at /ui
        uiModule(),
    ],
});
// #endregion modules
