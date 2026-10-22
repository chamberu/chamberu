// #region agent
// agents/triage/agent.ts: the name must match the folder name
import { defineAgent, http } from '@chamvi/app';

export default defineAgent({
    name: 'triage',
    model: 'anthropic:claude-sonnet-5-5',
    // instructions come from instructions.md, so the definition leaves them out
    triggers: [http()],
    budget: { maxSteps: 10 },
    notify: 'console',
});
// #endregion agent
