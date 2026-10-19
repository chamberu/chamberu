import type { ITokenVerifier } from '@authup/server-adapter-kit';
import type { Agent, IStore } from '@chamberu/core';
import { RunEngine } from '@chamberu/core';
import {
    authup,
    createHttpApp,
    createShutdown,
    oidc,
    staticTokens,
} from '@chamberu/http';
import type { Authenticator } from '@chamberu/http';
import { createScheduler } from '@chamberu/scheduler';
import { serve } from 'routup';

/** `verifier`: an authup `TokenVerifier` in remote mode (with a `creator`), so tokens carry their grants. */
export function authenticators(verifier: ITokenVerifier): Authenticator[] {
    // #region auth
    return [
        // CI and service accounts: tokens of at least 16 characters
        staticTokens({ tokens: { [process.env.CI_TOKEN!]: { id: 'ci', permissions: ['agent:deploy:run', 'run:read'] } } }),
        // authup: grants come from global tokens, verified remotely
        authup({ verifier }),
        // GitHub Actions OIDC: the mapper decides which repository gets which grants
        oidc({
            issuers: [{
                id: 'github-actions',
                issuer: 'https://token.actions.githubusercontent.com',
                audience: 'chamberu',
            }],
            principal: ({ claims }) => (claims.repository === 'acme/infra' ?
                {
                    id: `gha:${String(claims.sub)}`,
                    kind: 'oidc',
                    permissions: ['agent:deploy:run'],
                } :
                undefined),
        }),
    ];
    // #endregion auth
}

export async function start(store: IStore, agents: Agent[], resumeSecret: string, verifier: ITokenVerifier) {
    // #region app
    const engine = new RunEngine({
        store,
        agents,
        resumeSecret,
    });
    const scheduler = createScheduler({
        engine,
        agents,
        store,
    });

    let server: ReturnType<typeof serve> | undefined;
    const shutdown = createShutdown({
        engine,
        scheduler,
        // the server is created after the app; the helper only calls close() at shutdown
        server: { close: async (force) => { await server?.close(force); } },
        readinessDelayMs: 5_000,
    });

    const app = createHttpApp({
        engine,
        store,
        agents,
        auth: authenticators(verifier),
        shutdown,
        basePath: '/api',
        // behind one reverse proxy: trust its X-Forwarded-For
        trustProxy: 1,
        cors: { origin: 'https://chamberu.example.com' },
    });

    await engine.start();
    await scheduler.start();
    // srvx must not install its own signal handler
    server = serve(app, { port: 3000, gracefulShutdown: false });
    // #endregion app

    // #region shutdown
    // fail readiness, stop the scheduler, end streams, stop intake, drain
    process.once('SIGTERM', () => {
        void shutdown.shutdown().then(() => process.exit(0));
    });
    // #endregion shutdown

    return {
        app,
        engine,
        shutdown,
    };
}

// #region mcp
// OpenClaw (or any MCP client) lists the app as a streamable HTTP server
export const mcpServers = {
    chamberu: {
        type: 'http',
        url: 'http://chamberu.agents.svc/api/mcp',
        headers: { Authorization: 'Bearer ${CHAMBERU_TOKEN}' },
    },
};
// #endregion mcp
