/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { readdir, stat } from 'node:fs/promises';

export async function isDirectory(path: string): Promise<boolean> {
    try {
        return (await stat(path)).isDirectory();
    } catch {
        return false;
    }
}

/**
 * Whether `path` is a directory without a single entry, the shape an
 * unmounted volume leaves behind (its mount point). Any entry, a `.keep`
 * file included, makes it a real, if agent-less, agents dir.
 */
export async function isEmptyDirectory(path: string): Promise<boolean> {
    try {
        return (await readdir(path)).length === 0;
    } catch {
        return false;
    }
}
