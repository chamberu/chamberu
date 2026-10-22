/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */


import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
    basename,
    dirname,
    join,
    relative,
    sep,
} from 'node:path';
import type {
    AgentConfig,
    AgentDefinition,
    ApprovalPolicy,
    StateSchema,
    ToolContext,
    TriggerDefinition,
} from '@chamvi/core';
import { InvalidAgentDefinitionError, defineAgent } from '@chamvi/core';
import { locateMany } from 'locter';
import { isObject } from 'smob';
import type { Tool, ToolSet } from 'ai';
import {
    AGENT_FILE,
    AGENT_NAME_MAX_LENGTH,
    AGENT_NAME_PATTERN,
    APPROVALS_FILE,
    DATA_EXTENSIONS,
    INSTRUCTIONS_FILE,
    MODULE_EXTENSIONS,
    STATE_DIR,
    TOOLS_DIR,
    TOOL_NAME_PATTERN,
    TRIGGERS_DIR,
} from './constants.ts';
import {
    assertApprovals,
    compareCodePoints,
    defaultExportOf,
    findFile,
    isFile,
    isModuleFile,
    isStandardSchema,
    isTriggerDefinition,
    listFiles,
    messageOf,
    parseDataTrigger,
    relativize,
    useRegistry,
} from './helpers.ts';
import type {
    AgentLoadIssue,
    LoadAgentOptions,
    LoadAgentsResult,
    LoadedAgent,
} from './types.ts';

type ToolEntry = Tool | ((ctx: ToolContext) => Tool);

/**
 * Loads one agent folder (`dir`, whose name is the agent's): `agent.*`
 * (the AgentConfig), `instructions.md`, `tools/`, `triggers/`, `state/` and
 * `approvals.*`. Every failure is an InvalidAgentDefinitionError naming the
 * file relative to the agents dir (the folder's parent).
 */
export async function loadAgent(dir: string, options: LoadAgentOptions = {}): Promise<LoadedAgent> {
    const base = dirname(dir);
    try {
        // Hashed before the read: an edit made while loading then shows up as
        // a changed hash on the next poll, never as stale code under a fresh hash.
        const hash = await hashAgentFolder(dir);
        const agent = await buildAgent(dir, options.load ?? ((path) => useRegistry().read(path)));
        return {
            agent,
            hash,
            dir,
        };
    } catch (error) {
        if (error instanceof InvalidAgentDefinitionError) {
            const message = relativize(error.message, base);
            throw message === error.message ? error : new InvalidAgentDefinitionError(message);
        }
        throw new InvalidAgentDefinitionError(relativize(`${basename(dir)}: ${messageOf(error)}`, base));
    }
}

/**
 * Loads every agent folder of `root` (`listAgentFolders`), by name; a
 * folder that does not load is an issue, never a throw.
 */
export async function loadAgents(root: string, options: LoadAgentOptions = {}): Promise<LoadAgentsResult> {
    const agents: LoadedAgent[] = [];
    const issues: AgentLoadIssue[] = [];
    for (const name of await listAgentFolders(root)) {
        try {
            agents.push(await loadAgent(join(root, name), options));
        } catch (error) {
            issues.push({ agent: name, message: relativize(messageOf(error), root) });
        }
    }
    return { agents, issues };
}

/** The names of the direct subfolders of `root` not starting with `.` or `_`, in code-point order. */
export async function listAgentFolders(root: string): Promise<string[]> {
    const found = await locateMany('*', { cwd: root, onlyDirectories: true });
    return found
        .map((info) => basename(info.path))
        .filter((name) => !name.startsWith('.') && !name.startsWith('_'))
        .sort(compareCodePoints);
}

/**
 * The folder's content hash: sha256 (hex) over every file below `dir`
 * (dot-entries skipped) by relative POSIX path, each as
 * `path + '\0' + bytes + '\0'`.
 */
export async function hashAgentFolder(dir: string): Promise<string> {
    const found = await locateMany('**/*', {
        cwd: dir, 
        onlyFiles: true, 
        dot: false, 
    });
    const files = found
        .map((info) => ({ path: info.path, key: relative(dir, info.path).split(sep).join('/') }))
        .sort((a, b) => compareCodePoints(a.key, b.key));
    const hash = createHash('sha256');
    for (const file of files) {
        hash.update(`${file.key}\0`);
        hash.update(await readFile(file.path));
        hash.update('\0');
    }
    return hash.digest('hex');
}

async function buildAgent(dir: string, load: (path: string) => Promise<unknown>) {
    const name = basename(dir);
    if (name.length > AGENT_NAME_MAX_LENGTH || !AGENT_NAME_PATTERN.test(name)) {
        throw new InvalidAgentDefinitionError(
            `${name}: the folder name is no agent name (must match ${AGENT_NAME_PATTERN} and be at most ${AGENT_NAME_MAX_LENGTH} characters).`,
        );
    }
    const rel = (path: string) => `${name}/${relative(dir, path).split(sep).join('/')}`;
    const readModule = async (path: string) => defaultExportOf(await readWith(load, path, rel(path)), rel(path));
    const readData = (path: string) => readWith((p) => useRegistry().read(p), path, rel(path));

    const agentFile = await findFile(dir, AGENT_FILE, MODULE_EXTENSIONS);
    if (!agentFile) {
        throw new InvalidAgentDefinitionError(`${name}: has no agent.{ts,mts,js,mjs}.`);
    }
    const config = await readModule(agentFile);
    if (!isObject(config)) {
        throw new InvalidAgentDefinitionError(`${rel(agentFile)}: the default export must be an agent config object.`);
    }
    if ('name' in config) {
        throw new InvalidAgentDefinitionError(`${rel(agentFile)}: must not set a name (the folder name is the agent name).`);
    }
    const definition = { ...config } as AgentConfig;

    const instructionsFile = join(dir, INSTRUCTIONS_FILE);
    const hasInstructionsFile = await isFile(instructionsFile);
    if (hasInstructionsFile && definition.instructions !== undefined) {
        throw new InvalidAgentDefinitionError(`${name}: sets instructions in both ${rel(agentFile)} and ${INSTRUCTIONS_FILE}.`);
    }
    if (hasInstructionsFile) {
        definition.instructions = await readFile(instructionsFile, 'utf8');
    } else if (definition.instructions === undefined) {
        throw new InvalidAgentDefinitionError(`${name}: sets no instructions (neither in ${rel(agentFile)} nor in ${INSTRUCTIONS_FILE}).`);
    }

    const tools = new Map<string, ToolEntry>();
    const toolFiles = await listFiles(join(dir, TOOLS_DIR), MODULE_EXTENSIONS);
    for (const file of toolFiles) {
        if (!TOOL_NAME_PATTERN.test(file.stem)) {
            throw new InvalidAgentDefinitionError(`${rel(file.path)}: "${file.stem}" is no tool name (must match ${TOOL_NAME_PATTERN}).`);
        }
        if (tools.has(file.stem)) {
            throw new InvalidAgentDefinitionError(`${rel(file.path)}: another file defines the tool "${file.stem}".`);
        }
        const tool = await readModule(file.path);
        if (!isObject(tool) && typeof tool !== 'function') {
            throw new InvalidAgentDefinitionError(`${rel(file.path)}: the default export must be a Tool or a (ctx) => Tool function.`);
        }
        tools.set(file.stem, tool as ToolEntry);
    }
    if (tools.size > 0) {
        definition.tools = mergeTools(name, definition.tools, tools, rel(agentFile));
    }

    const triggers: TriggerDefinition[] = [...definition.triggers ?? []];
    for (const file of await listFiles(join(dir, TRIGGERS_DIR), [...MODULE_EXTENSIONS, ...DATA_EXTENSIONS])) {
        if (isModuleFile(file.path)) {
            const trigger = await readModule(file.path);
            if (!isTriggerDefinition(trigger)) {
                throw new InvalidAgentDefinitionError(`${rel(file.path)}: the default export must be a TriggerDefinition.`);
            }
            triggers.push(trigger);
        } else {
            triggers.push(await parseDataTrigger(await readData(file.path), rel(file.path)));
        }
    }
    if (triggers.length > 0) definition.triggers = triggers;

    const stateFiles = await listFiles(join(dir, STATE_DIR), MODULE_EXTENSIONS);
    if (stateFiles.length > 0) {
        const state: StateSchema = { ...definition.state };
        for (const file of stateFiles) {
            if (file.stem in state) {
                throw new InvalidAgentDefinitionError(`${rel(file.path)}: the collection "${file.stem}" is also in the config's state.`);
            }
            const schema = await readModule(file.path);
            if (!isStandardSchema(schema)) {
                throw new InvalidAgentDefinitionError(`${rel(file.path)}: the default export must be a Standard Schema.`);
            }
            state[file.stem] = schema as StateSchema[string];
        }
        definition.state = state;
    }

    const approvalsFile = await findFile(dir, APPROVALS_FILE, [...MODULE_EXTENSIONS, ...DATA_EXTENSIONS]);
    if (approvalsFile) {
        const data = !isModuleFile(approvalsFile);
        const value = data ? await readData(approvalsFile) : await readModule(approvalsFile);
        const approvals: Record<string, ApprovalPolicy> = { ...definition.approvals };
        for (const [tool, policy] of Object.entries(assertApprovals(value, rel(approvalsFile), data))) {
            if (tool in approvals) {
                throw new InvalidAgentDefinitionError(`${rel(approvalsFile)}: the approval of "${tool}" is also in the config's approvals.`);
            }
            approvals[tool] = policy;
        }
        definition.approvals = approvals;
    }

    return defineAgent({ ...definition, name } as AgentDefinition);
}

async function readWith(load: (path: string) => Promise<unknown>, path: string, file: string): Promise<unknown> {
    try {
        return await load(path);
    } catch (error) {
        throw new InvalidAgentDefinitionError(`${file}: ${messageOf(error)}`);
    }
}

/**
 * The config's tools plus the folder's: a plain set when both are plain, else a
 * factory. A name in both is refused here for a plain config set, and by the
 * factory (at execution) for a factory config set.
 */
function mergeTools(
    name: string,
    configured: AgentConfig['tools'],
    files: Map<string, ToolEntry>,
    agentFile: string,
): AgentConfig['tools'] {
    if (typeof configured !== 'function') {
        for (const tool of files.keys()) {
            if (configured && tool in configured) {
                throw new InvalidAgentDefinitionError(`${name}/${TOOLS_DIR}: the tool "${tool}" is also in ${agentFile}'s tools.`);
            }
        }
        const factories = files.values().some((entry) => typeof entry === 'function');
        if (!factories) {
            return { ...configured, ...Object.fromEntries(files) } as ToolSet;
        }
    }
    return (ctx: ToolContext) => {
        const base: ToolSet = typeof configured === 'function' ? configured(ctx) : { ...configured };
        const set: ToolSet = { ...base };
        for (const [tool, entry] of files) {
            if (tool in base) {
                throw new InvalidAgentDefinitionError(`Agent "${name}": the tool "${tool}" of ${TOOLS_DIR}/ is also in the tools factory's set.`);
            }
            set[tool] = typeof entry === 'function' ? entry(ctx) : entry;
        }
        return set;
    };
}
