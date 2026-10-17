import { tool } from 'ai';
import type { LanguageModel } from 'ai';
import { z } from 'zod';
import { FatalToolError, defineAgent } from '@chamberu/core';

declare function readFile(path: string): Promise<string>;

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
