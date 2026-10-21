/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { IClock } from '@chamberu/core';
import { SandboxError } from '@chamberu/core';
import { collectionError } from '@chamberu/sandbox';
import type { IWorkspace } from '@chamberu/sandbox';
import { WORKSPACE_ID_PATTERN, WORKSPACE_RECORD } from './constants.ts';
import { errnoCode } from './helpers.ts';

/** Expiry (epoch ms) from a workspace folder's record; undefined when it has none. */
async function readExpiry(dir: string): Promise<number | undefined> {
    try {
        const record = JSON.parse(await readFile(join(dir, WORKSPACE_RECORD), 'utf8')) ?? {};
        const { expiresAt } = record as { expiresAt?: unknown };
        const time = typeof expiresAt === 'string' ? Date.parse(expiresAt) : NaN;
        return Number.isNaN(time) ? undefined : time;
    } catch {
        return undefined;
    }
}

/**
 * Deletes every workspace folder under `root` whose record says it expired
 * (`expiresAt <= now`). A workspace still open in this process is disposed,
 * so its running commands die too. Folders that are no workspace (no uuid
 * name, no readable record) are left alone. Returns how many were deleted;
 * a folder that cannot go never keeps the others (one SandboxError at the end).
 */
export async function collectExpired(
    root: string,
    clock: IClock,
    live: ReadonlyMap<string, IWorkspace>,
): Promise<number> {
    let names: string[];
    try {
        names = await readdir(root);
    } catch (error) {
        if (errnoCode(error) === 'ENOENT') return 0;
        throw new SandboxError(`cannot list the workspaces (${errnoCode(error) ?? 'unknown error'}).`, { cause: error });
    }

    const now = clock.now().getTime();
    let count = 0;
    const failures: SandboxError[] = [];
    for (const name of names) {
        if (!WORKSPACE_ID_PATTERN.test(name)) continue;
        const dir = join(root, name);
        const expiresAt = await readExpiry(dir);
        if (expiresAt === undefined || expiresAt > now) continue;

        const workspace = live.get(name);
        try {
            if (workspace) {
                await workspace.dispose();
            } else {
                await rm(dir, {
                    recursive: true,
                    force: true,
                    maxRetries: 3,
                });
            }
        } catch (error) {
            failures.push(error instanceof SandboxError ?
                error :
                new SandboxError(`cannot remove workspace ${name} (${errnoCode(error) ?? 'unknown error'}).`, { cause: error }));
            continue;
        }
        count++;
    }
    if (failures.length > 0) throw collectionError(count, failures);
    return count;
}
