import type { LanguageModel } from 'ai';
import {
    MemoryStore,
    RunEngine,
    defineAgent,
    http,
} from '@chamberu/core';
import { createHttpApp, createShutdown, staticTokens } from '@chamberu/http';

export async function createAgentServer(model: LanguageModel) {
    const echo = defineAgent({
        name: 'echo',
        model,
        instructions: 'Answer with a short summary of the payload.',
        // http() lets REST (POST /agents/echo/runs) and MCP (run_echo) start runs
        triggers: [http()],
    });

    const agents = [echo];
    const store = new MemoryStore();
    const engine = new RunEngine({
        store,
        agents,
        resumeSecret: 'change-me',
    });

    const token = process.env.CHAMBERU_TOKEN;
    if (!token) throw new Error('Set CHAMBERU_TOKEN (at least 16 characters).');

    const shutdown = createShutdown({ engine });
    const app = createHttpApp({
        engine,
        store,
        agents,
        auth: staticTokens({
            tokens: [{
                value: token,
                id: 'ci',
                permissions: ['*'],
            }],
        }),
        shutdown,
    });

    await engine.start();

    // serve it with routup (srvx); let createShutdown own SIGTERM:
    // const server = serve(app, { port: 3000, gracefulShutdown: false });
    // process.once('SIGTERM', () => shutdown.shutdown());
    return {
        app,
        engine,
        shutdown,
    };
}
