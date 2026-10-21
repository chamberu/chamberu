import type { LanguageModel } from 'ai';
import { codingTools } from '@chamvi/coding';
import { defineAgent, http } from '@chamvi/core';
import type { IWorkspaceManager } from '@chamvi/sandbox';

export function createCodingAgent(model: LanguageModel, workspaces: IWorkspaceManager) {
    return defineAgent({
        name: 'triage',
        model,
        instructions: 'Check out the repository named in the payload, reproduce the reported bug ' +
            'with a failing test and answer with what you found and the diff.',
        triggers: [http()],
        // create_workspace and dispose_workspace, then the seven coding tools
        tools: { ...workspaces.tools(), ...codingTools(workspaces) },
        // every shell command waits for a human
        approvals: { bash: 'user' },
        budget: { maxSteps: 40 },
    });
}
