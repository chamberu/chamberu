/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isApp } from '@chamvi/app';
import type { IApp } from '@chamvi/app';
import { createUsageError, isRecord } from '../run/helpers.ts';
import type { CliContext } from '../run/types.ts';
import { BUILT_ENTRY, SOURCE_ENTRY } from './constants.ts';
import type { ResolveEntryInput } from './types.ts';

async function isFile(file: string): Promise<boolean> {
    try {
        return (await stat(file)).isFile();
    } catch {
        return false;
    }
}

/** `package.json` `chamvi.entry` of `cwd`, undefined without a package.json or the field. */
async function readPackageEntry(cwd: string): Promise<string | undefined> {
    let text: string;
    try {
        text = await readFile(path.join(cwd, 'package.json'), 'utf8');
    } catch {
        return undefined;
    }

    let manifest: unknown;
    try {
        manifest = JSON.parse(text);
    } catch {
        throw createUsageError(`${path.join(cwd, 'package.json')} is not valid JSON.`);
    }

    const chamvi = isRecord(manifest) ? manifest.chamvi : undefined;
    if (!isRecord(chamvi) || typeof chamvi.entry === 'undefined') {
        return undefined;
    }

    if (typeof chamvi.entry !== 'string' || chamvi.entry.length === 0) {
        throw createUsageError('package.json chamvi.entry must be a non-empty path.');
    }

    return chamvi.entry;
}

/**
 * The absolute entry path: `--entry`, else for a source command
 * `package.json` `chamvi.entry`, else `src/index.ts` (source) or
 * `dist/index.mjs` (built; the built commands never read `chamvi.entry`, so
 * an image built from a repo setting it still starts). A missing file, and
 * an `--entry` without a path, is a `cli_usage` error.
 */
export async function resolveEntry(input: ResolveEntryInput): Promise<string> {
    if (typeof input.entry !== 'undefined' && (typeof input.entry !== 'string' || input.entry.length === 0)) {
        throw createUsageError('--entry needs a path.');
    }

    if (typeof input.entry === 'string') {
        const file = path.resolve(input.cwd, input.entry);
        if (!(await isFile(file))) {
            throw createUsageError(`${input.entry} not found.`);
        }
        return file;
    }

    if (input.kind === 'built') {
        const file = path.resolve(input.cwd, BUILT_ENTRY);
        if (!(await isFile(file))) {
            throw createUsageError(`${BUILT_ENTRY} not found: run \`chamvi build\` or pass --entry ${SOURCE_ENTRY}.`);
        }
        return file;
    }

    const configured = await readPackageEntry(input.cwd);
    if (configured) {
        const file = path.resolve(input.cwd, configured);
        if (!(await isFile(file))) {
            throw createUsageError(`${configured} (package.json chamvi.entry) not found.`);
        }
        return file;
    }

    const file = path.resolve(input.cwd, SOURCE_ENTRY);
    if (!(await isFile(file))) {
        throw createUsageError(`${SOURCE_ENTRY} not found: pass --entry <path> or set chamvi.entry in package.json.`);
    }
    return file;
}

/**
 * Imports the entry (as a file URL) and returns its default export; a default
 * export that is no app is a `cli_usage` error. Errors of the import itself
 * (a module factory missing its env) pass through.
 */
export async function loadApp(file: string, importModule: CliContext['importModule']): Promise<IApp> {
    const exports = await importModule(pathToFileURL(file).href);
    const app = isRecord(exports) ? exports.default : undefined;
    if (!isApp(app)) {
        throw createUsageError(`${file} must \`export default createApp({...})\`.`);
    }

    return app;
}
