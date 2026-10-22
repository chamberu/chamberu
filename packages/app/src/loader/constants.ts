/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */


/** Module files, in the order a folder's `agent.*` is looked up. */
export const MODULE_EXTENSIONS = ['.ts', '.mts', '.js', '.mjs'] as const;

/**
 * JavaScript files: allowed only as the module files the loader reads itself
 * (it transpiles those fresh); a helper must be `.ts` or `.mts`, since a
 * natively imported JavaScript file stays cached for the life of the process.
 */
export const SCRIPT_EXTENSIONS = ['.js', '.mjs', '.cjs'] as const;

/** Scopes whose packages resolve to the app's copies (with the `ai` package). */
export const PINNED_PACKAGE_SCOPES = ['@chamvi', '@ai-sdk'] as const;

export const NODE_MODULES_DIR = 'node_modules';

/** Data files (YAML or JSON) a trigger or the approvals may be written in. */
export const DATA_EXTENSIONS = ['.yaml', '.yml', '.json'] as const;

export const AGENT_FILE = 'agent';
export const INSTRUCTIONS_FILE = 'instructions.md';
export const APPROVALS_FILE = 'approvals';
export const TOOLS_DIR = 'tools';
export const TRIGGERS_DIR = 'triggers';
export const STATE_DIR = 'state';

/** core's agent name rule (`agent/constants.ts`, internal there). */
export const AGENT_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const AGENT_NAME_MAX_LENGTH = 64;

export const TOOL_NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** The keys of each data trigger form; the first one names the form. */
export const DATA_TRIGGER_KEYS = {
    cron: ['cron', 'timezone', 'overlap', 'payload'],
    http: ['http'],
    webhook: ['webhook'],
} as const;

export const OVERLAP_POLICIES = ['skip', 'queue-one', 'allow'] as const;
