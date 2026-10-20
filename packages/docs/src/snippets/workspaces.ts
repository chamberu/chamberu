import type { LanguageModel } from 'ai';
import type { IStore } from '@chamberu/core';
import { RunEngine, defineAgent, http } from '@chamberu/core';
import { codingTools } from '@chamberu/coding';
import { createWorkspaceManager } from '@chamberu/sandbox';
import type { ISandboxProvider } from '@chamberu/sandbox';
import { createLocalSandbox } from '@chamberu/sandbox-local';

export async function serve(store: IStore, model: LanguageModel, provider: ISandboxProvider) {
    // #region setup
    const workspaces = createWorkspaceManager({
        provider,
        // only your own repositories; the model cannot clone anything else
        allowRepo: (url) => url.startsWith('https://github.com/acme/'),
        limits: { timeoutMs: 20 * 60_000 },
    });

    const repro = defineAgent({
        name: 'repro',
        model,
        instructions: 'Check out the repository from the payload, write a failing test for the reported bug, ' +
            'run it and answer with the output and the diff.',
        triggers: [http()],
        tools: { ...workspaces.tools(), ...codingTools(workspaces) },
        approvals: { bash: 'user' },
    });

    const engine = new RunEngine({
        store,
        agents: [repro],
        resumeSecret: 'change-me',
    });
    // a run's workspaces go once it completed, failed or was cancelled
    workspaces.attach(engine);
    await engine.start();

    process.once('SIGTERM', async () => {
        await engine.drain({ timeoutMs: 25_000 });
        // after the drain: runs still executing keep their workspaces until then
        await workspaces.close();
        process.exit(0);
    });
    // #endregion setup

    return { engine, workspaces };
}

export function development() {
    // #region local
    // no isolation: commands run as your user in a temporary directory
    const workspaces = createWorkspaceManager({
        provider: createLocalSandbox(),
        // local fixtures as file:///absolute/path repositories
        allowFileRepos: true,
    });
    // #endregion local

    return workspaces;
}
