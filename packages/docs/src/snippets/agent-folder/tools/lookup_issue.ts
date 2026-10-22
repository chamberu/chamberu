// #region tool
// agents/triage/tools/lookup_issue.ts: the tool is named lookup_issue
import { defineTool } from '@chamvi/app';
import { z } from 'zod';

export default defineTool({
    description: 'Reads an issue the agent saw before.',
    inputSchema: z.object({ number: z.number().int().positive() }),
    execute: async ({ number }, { context }) => (await context.state.get(`issue:${number}`)) ?? { unknown: true },
});
// #endregion tool
