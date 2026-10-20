import { tool } from 'ai';
import type { LanguageModel } from 'ai';
import { z } from 'zod';
import {
    FatalToolError,
    defineAgent,
    hasPermission,
    requireToolPermission,
} from '@chamberu/core';
import type { ToolPolicy } from '@chamberu/core';

declare function readFile(path: string): Promise<string>;
declare function deployVersion(version: string, requestedBy: string): Promise<string>;

export function createReader(model: LanguageModel) {
    // #region fatal
    const reader = defineAgent({
        name: 'reader',
        model,
        instructions: 'Answer questions about the repository.',
        tools: () => ({
            readFile: tool({
                description: 'Reads a file of the repository.',
                inputSchema: z.object({ path: z.string() }),
                execute: async ({ path }) => {
                    if (path.startsWith('/etc/')) {
                        // fails the whole run with code 'FatalToolError'
                        throw new FatalToolError(`Refusing to read ${path}.`);
                    }
                    // any other error goes back to the model as a tool error result
                    return readFile(path);
                },
            }),
        }),
    });
    // #endregion fatal

    return reader;
}

export function createOps(model: LanguageModel) {
    // #region policy
    const byPermission = requireToolPermission();
    // exceptions wrap the built-in policy: status is open to every invoker
    const toolPolicy: ToolPolicy = (toolName, ctx) => toolName === 'status' || byPermission(toolName, ctx);

    const ops = defineAgent({
        name: 'ops',
        model,
        instructions: 'Operate the service.',
        // offers deploy only to invokers holding tool:ops:deploy (or tool:ops:*, or *)
        toolPolicy,
        tools: ({ run }) => ({
            status: tool({
                description: 'Reports the service status.',
                inputSchema: z.object({}),
                execute: async () => 'healthy',
            }),
            deploy: tool({
                description: 'Deploys a version.',
                inputSchema: z.object({ version: z.string() }),
                // the invoker is a snapshot of who started the run, read by closure
                execute: async ({ version }) => deployVersion(version, run.trigger.invoker?.id ?? 'unknown'),
            }),
        }),
        approvals: {
            // a release manager deploys without asking, everyone else waits for the owner
            deploy: (_input, { runtimeContext }) => {
                const { invoker } = runtimeContext.trigger;
                return invoker && hasPermission(invoker.permissions, 'release:manage') ? 'allow' : 'user';
            },
        },
    });
    // #endregion policy

    return ops;
}
