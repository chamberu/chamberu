import {
    consoleNotifierModule,
    createApp,
    cron,
    defineAgent,
    http,
} from '@chamvi/app';

const triage = defineAgent({
    name: 'triage',
    // resolved through the installed provider package (@ai-sdk/anthropic, ANTHROPIC_API_KEY)
    model: 'anthropic:claude-sonnet-5-5',
    instructions: 'Triage the reported issue: label it and summarize the next step.',
    triggers: [
        // POST /agents/triage/runs, the UI and MCP
        http(),
        // every 30 minutes, Berlin time
        cron('*/30 * * * *', { timezone: 'Europe/Berlin' }),
    ],
    notify: 'console',
});

// chamvi start | run-job | migrate load this default export
export default createApp({
    agents: [triage],
    modules: [consoleNotifierModule()],
});
