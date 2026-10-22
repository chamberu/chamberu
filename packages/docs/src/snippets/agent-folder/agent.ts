// #region agent
// agents/triage/agent.ts: the folder name is the agent name
import { http } from '@chamvi/app';
import type { AgentConfig } from '@chamvi/app';

export default {
    model: 'anthropic:claude-sonnet-5-5',
    // instructions come from instructions.md, so the config leaves them out
    triggers: [http()],
    budget: { maxSteps: 10 },
    notify: 'console',
} satisfies Omit<AgentConfig, 'instructions'>;
// #endregion agent
