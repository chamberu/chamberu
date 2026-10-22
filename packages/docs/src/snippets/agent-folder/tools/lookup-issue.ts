// #region tool
// agents/triage/tools/lookup-issue.ts: the agent's own file, imported by agent.ts
import { defineTool } from '@chamvi/app';
import { z } from 'zod';

export const lookupIssue = defineTool({
    description: 'Reads an issue the agent saw before.',
    inputSchema: z.object({ number: z.number().int().positive() }),
    execute: async ({ number }, { context }) => (await context.state.get(`issue:${number}`)) ?? { unknown: true },
});
// #endregion tool
