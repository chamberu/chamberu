import { tool } from 'ai';
import type { LanguageModel } from 'ai';
import { z } from 'zod';
import {
    FatalToolError,
    defineAgent,
    defineTool,
    hasPermission,
    requireToolPermission,
} from '@chamberu/core';
import type { ToolPolicy } from '@chamberu/core';

declare const model: LanguageModel;
declare function readFile(path: string): Promise<string>;
declare function deployVersion(version: string, requestedBy: string, signal: AbortSignal): Promise<string>;
declare function search(query: string, apiKey: string): Promise<string[]>;

// #region fatal
export const reader = defineAgent({
    name: 'reader',
    model,
    instructions: 'Answer questions about the repository.',
    tools: {
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
    },
});
// #endregion fatal

// #region policy
const status = tool({
    description: 'Reports the service status.',
    inputSchema: z.object({}),
    execute: async () => 'healthy',
});

// defined once; the run context arrives per call
const deploy = defineTool({
    description: 'Deploys a version.',
    inputSchema: z.object({ version: z.string() }),
    execute: async ({ version }, { context }) => {
        // the invoker is a snapshot of who started the run
        const { invoker } = context.run.trigger;
        if (!invoker) throw new FatalToolError('deploy needs an invoker');
        // aborts on cancel, drain or timeout
        return deployVersion(version, invoker.id, context.run.signal);
    },
});

const byPermission = requireToolPermission();
// exceptions wrap the built-in policy: status is open to every invoker
const toolPolicy: ToolPolicy = (toolName, ctx) => toolName === 'status' || byPermission(toolName, ctx);

export const ops = defineAgent({
    name: 'ops',
    model,
    instructions: 'Operate the service.',
    // offers deploy only to invokers holding tool:ops:deploy (or tool:ops:*, or *)
    toolPolicy,
    tools: { status, deploy },
    approvals: {
        // a release manager deploys without asking, everyone else waits for the owner
        deploy: (_input, { runtimeContext }) => {
            const { invoker } = runtimeContext.trigger;
            return invoker && hasPermission(invoker.permissions, 'release:manage') ? 'allow' : 'user';
        },
    },
});
// #endregion policy

// #region third-party
// a tool from another library, with its own context schema
const searchTool = tool({
    description: 'Searches the web.',
    inputSchema: z.object({ q: z.string() }),
    contextSchema: z.object({ apiKey: z.string() }),
    execute: async (input, { context }) => search(input.q, context.apiKey),
});

export const researcher = defineAgent({
    name: 'researcher',
    model,
    instructions: 'Research the question in the trigger payload.',
    tools: { search: searchTool },
    // per tool name, passed through unchanged to every call of every run
    toolsContext: { search: { apiKey: process.env.SEARCH_KEY ?? '' } },
});
// #endregion third-party
