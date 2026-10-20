/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IWorkspaceManager } from '@chamberu/sandbox';

/** What the coding tools need of a workspace manager: the run's workspaces by id. */
export type CodingWorkspaces = Pick<IWorkspaceManager, 'get'>;

export type ReadFileResult = {
    /** Relative to `/workspace`. */
    path: string;
    content: string;
    /** 1-based, inclusive. */
    startLine: number;
    endLine: number;
    totalLines: number;
    /** True when `content` was cut at `READ_MAX_CHARS`. */
    truncated: boolean;
};

export type WriteFileResult = {
    path: string;
    bytes: number;
};

export type EditFileResult = {
    path: string;
    replacements: number;
};

export type GrepMatch = {
    path: string;
    line: number;
    text: string;
};

export type GrepResult = {
    matches: GrepMatch[];
    /** True when more matches exist than were returned. */
    truncated: boolean;
};

export type ListFilesResult = {
    files: string[];
    truncated: boolean;
};

export type GitDiffResult = {
    /** `git status --short`. */
    status: string;
    diff: string;
    truncated: boolean;
};
