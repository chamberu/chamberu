/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */


/** The one file an agent folder must hold. */
export const AGENT_FILE = 'agent.ts';

/**
 * JavaScript files, refused anywhere in an agent folder: a natively imported
 * JavaScript file stays cached for the life of the process, so helpers are
 * `.ts` or `.mts` (transpiled fresh on every load).
 */
export const SCRIPT_EXTENSIONS = ['.js', '.mjs', '.cjs'] as const;

/** Scopes whose packages resolve to the app's copies (with the `ai` package). */
export const PINNED_PACKAGE_SCOPES = ['@chamvi', '@ai-sdk'] as const;

export const NODE_MODULES_DIR = 'node_modules';

/** core's agent name rule (`agent/constants.ts`, internal there). */
export const AGENT_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const AGENT_NAME_MAX_LENGTH = 64;
