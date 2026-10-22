/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */


import { realpathSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { extname, join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ApprovalPolicy, TriggerDefinition } from '@chamvi/core';
import {
    InvalidAgentDefinitionError,
    cron,
    http,
    webhook,
} from '@chamvi/core';
import { IssueCode, flattenIssueItems } from '@ebec/core';
import { createJiti } from 'jiti';
import { FormatRegistry } from 'locter';
import { isObject } from 'smob';
import {
    Container,
    createValidupError,
    defineValidator,
    isValidupError,
} from 'validup';
import type { ValidatorDescriptor } from 'validup';
import { DATA_TRIGGER_KEYS, MODULE_EXTENSIONS, OVERLAP_POLICIES } from './constants.ts';
import type { FolderFile } from './types.ts';

let registry: FormatRegistry | undefined;

/**
 * One scoped locter registry (never `setModuleReader`, which is process
 * global): module files through one jiti without module or fs cache, so a
 * re-read sees edits and writes nothing into `node_modules`, while jiti's
 * async import keeps packages native (one instance per package); YAML and
 * JSON through locter's built-ins.
 */
export function useRegistry(): FormatRegistry {
    if (!registry) {
        const jiti = createJiti(import.meta.url, {
            moduleCache: false, 
            fsCache: false, 
            interopDefault: true, 
        });
        registry = new FormatRegistry({
            rules: [{
                id: 'chamvi-agent-module',
                test: ['.ts', '.mts', '.mjs', '.js'],
                reader: { read: (id: string) => jiti.import(id), readSync: (id: string) => jiti(id) },
            }],
        });
    }
    return registry;
}

export function isModuleFile(path: string): boolean {
    return (MODULE_EXTENSIONS as readonly string[]).includes(extname(path));
}

/** The first `<stem><extension>` file of `dir`, in the order of `extensions`. */
export async function findFile(dir: string, stem: string, extensions: readonly string[]): Promise<string | undefined> {
    for (const extension of extensions) {
        const path = join(dir, `${stem}${extension}`);
        if (await isFile(path)) return path;
    }
    return undefined;
}

export async function isFile(path: string): Promise<boolean> {
    try {
        return (await stat(path)).isFile();
    } catch {
        return false;
    }
}

/**
 * The files of `dir` with one of `extensions`, by name in code-point order;
 * dot- and underscore-prefixed entries, folders and other files are left
 * out. A missing folder has none.
 */
export async function listFiles(dir: string, extensions: readonly string[]): Promise<FolderFile[]> {
    let names: string[];
    try {
        names = await readdir(dir);
    } catch {
        return [];
    }
    const files: FolderFile[] = [];
    for (const name of names.sort(compareCodePoints)) {
        if (name.startsWith('.') || name.startsWith('_')) continue;
        const extension = extname(name);
        if (!extensions.includes(extension)) continue;
        const path = join(dir, name);
        if (!await isFile(path)) continue;
        files.push({
            path,
            name,
            stem: name.slice(0, -extension.length),
            extension,
        });
    }
    return files;
}

export function compareCodePoints(a: string, b: string): number {
    if (a === b) return 0;
    return a < b ? -1 : 1;
}

/** The message of a thrown value, with its cause's message when that adds to it. */
export function messageOf(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    const cause = error instanceof Error ? error.cause : undefined;
    if (cause instanceof Error && cause.message && !message.includes(cause.message)) {
        return `${message} (${cause.message})`;
    }
    return message;
}

/** `message` with every spelling of `base` (path, real path, file URL) cut, so it names paths relative to it. */
export function relativize(message: string, base: string): string {
    const prefixes = new Set<string>([base]);
    try {
        prefixes.add(realpathSync(base));
    } catch {
        // a missing base has no real path
    }
    for (const prefix of [...prefixes]) {
        prefixes.add(pathToFileURL(prefix).href);
    }
    let out = message;
    // the longest first, so a URL is not cut down to its path part
    for (const prefix of [...prefixes].sort((a, b) => b.length - a.length)) {
        out = out.split(`${prefix}${prefix.startsWith('file:') ? '/' : sep}`).join('');
        out = out.split(prefix).join('.');
    }
    return out;
}

/** The default export of a module namespace, or an error naming the file. */
export function defaultExportOf(mod: unknown, file: string): unknown {
    if ((isObject(mod) || typeof mod === 'function') && 'default' in mod) {
        return (mod as { default: unknown }).default;
    }
    throw new InvalidAgentDefinitionError(`${file}: has no default export.`);
}

export function isStandardSchema(value: unknown): boolean {
    return (isObject(value) || typeof value === 'function') && isObject((value as Record<string, unknown>)['~standard']);
}

export function isTriggerDefinition(value: unknown): value is TriggerDefinition {
    return isObject(value) &&
        typeof value.source === 'string' &&
        typeof value.id === 'string' &&
        value.id.length > 0 &&
        isObject(value.options);
}

/**
 * `Record<tool, ApprovalPolicy>`: `'user'` or (module files only) a policy
 * function per tool name.
 */
export function assertApprovals(value: unknown, file: string, data: boolean): Record<string, ApprovalPolicy> {
    if (!isObject(value)) {
        throw new InvalidAgentDefinitionError(`${file}: must map tool names to approval policies.`);
    }
    for (const [tool, policy] of Object.entries(value)) {
        if (policy === 'user') continue;
        if (!data && typeof policy === 'function') continue;
        throw new InvalidAgentDefinitionError(data ?
            `${file}: the approval of "${tool}" must be "user" in a data file.` :
            `${file}: the approval of "${tool}" must be "user" or a policy function.`);
    }
    return value as Record<string, ApprovalPolicy>;
}

type DataTriggerForm = keyof typeof DATA_TRIGGER_KEYS;

type CronData = {
    cron: string; 
    timezone?: string; 
    overlap?: typeof OVERLAP_POLICIES[number]; 
    payload?: unknown 
};

/**
 * A data trigger (`triggers/<file>.{yaml,yml,json}`): exactly one of
 * `{ cron, timezone?, overlap?, payload? }`, `{ http: true }` and
 * `{ webhook: '/path' }`, any other key an error.
 */
export async function parseDataTrigger(value: unknown, file: string): Promise<TriggerDefinition> {
    if (!isObject(value)) {
        throw new InvalidAgentDefinitionError(`${file}: must be an object.`);
    }
    const forms = (Object.keys(DATA_TRIGGER_KEYS) as DataTriggerForm[]).filter((form) => form in value);
    if (forms.length !== 1) {
        throw new InvalidAgentDefinitionError(`${file}: must name exactly one of cron, http and webhook.`);
    }
    const form = forms[0] as DataTriggerForm;
    const allowed: readonly string[] = DATA_TRIGGER_KEYS[form];
    const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
    if (unknown.length > 0) {
        throw new InvalidAgentDefinitionError(`${file}: unknown key ${unknown.map((key) => `"${key}"`).join(', ')} for a ${form} trigger.`);
    }

    try {
        if (form === 'cron') {
            const data = await createCronContainer().run(value);
            const { cron: expression, ...options } = data;
            return cron(expression, options);
        }
        if (form === 'http') {
            await createHttpContainer().run(value);
            return http();
        }
        const data = await createWebhookContainer().run(value);
        return webhook({ path: data.webhook });
    } catch (error) {
        if (isValidupError(error)) {
            const issues = flattenIssueItems(error.issues)
                .map((issue) => `${issue.path.join('.')} ${issue.message}`)
                .join('; ');
            throw new InvalidAgentDefinitionError(`${file}: ${issues}.`);
        }
        if (error instanceof InvalidAgentDefinitionError) {
            throw new InvalidAgentDefinitionError(`${file}: ${error.message}`);
        }
        throw error;
    }
}

function createCronContainer(): Container<CronData> {
    const container = new Container<CronData>();
    container.mount('cron', isText());
    container.mount('timezone', { optional: true }, isText());
    container.mount('overlap', { optional: true }, isOneOf(OVERLAP_POLICIES));
    container.mount('payload', { optional: true }, isAny());
    return container;
}

function createHttpContainer(): Container<{ http: true }> {
    const container = new Container<{ http: true }>();
    container.mount('http', defineValidator({
        run: ({ value }) => {
            if (value !== true) throw createValidupError(value, IssueCode.VALUE_INVALID, 'must be true');
            return value;
        },
    }));
    return container;
}

function createWebhookContainer(): Container<{ webhook: string }> {
    const container = new Container<{ webhook: string }>();
    container.mount('webhook', defineValidator({
        run: ({ value }) => {
            if (typeof value !== 'string' || !value.startsWith('/')) {
                throw createValidupError(value, IssueCode.VALUE_INVALID, 'must be a path starting with /');
            }
            return value;
        },
    }));
    return container;
}

function isText(): ValidatorDescriptor {
    return defineValidator({
        run: ({ value }) => {
            if (typeof value !== 'string' || value.length === 0) {
                throw createValidupError(value, IssueCode.VALUE_INVALID, 'must be a non-empty string');
            }
            return value;
        },
    });
}

function isOneOf(values: readonly string[]): ValidatorDescriptor {
    return defineValidator({
        run: ({ value }) => {
            if (typeof value !== 'string' || !values.includes(value)) {
                throw createValidupError(value, IssueCode.VALUE_INVALID, `must be one of ${values.join(', ')}`);
            }
            return value;
        },
    });
}

function isAny(): ValidatorDescriptor {
    return defineValidator({ run: ({ value }) => value });
}
