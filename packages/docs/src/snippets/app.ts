// #region entry
// src/index.ts
import {
    consoleNotifierModule,
    createApp,
    cron,
    defineAgent,
    http,
} from '@chamvi/app';

const digest = defineAgent({
    name: 'digest',
    // resolved through @ai-sdk/anthropic and ANTHROPIC_API_KEY, never the Vercel Gateway
    model: 'anthropic:claude-sonnet-5-5',
    instructions: 'Summarize what happened since the last digest.',
    triggers: [
        // POST /agents/digest/runs, the dashboard and MCP
        http(),
        // weekdays at 08:00, Berlin time
        cron('0 8 * * 1-5', { timezone: 'Europe/Berlin' }),
    ],
    notify: 'console',
});

// synchronous and side-effect free: chamvi start | run-job | migrate load this default export
export default createApp({
    agents: [digest],
    modules: [consoleNotifierModule()],
});
// #endregion entry
