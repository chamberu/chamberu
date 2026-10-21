/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IWorkspace } from '@chamvi/sandbox';

export type CodingBudget = {
    maxSteps?: number;
    maxTokens?: number;
    timeoutMs?: number;
};

export type CodingTask = {
    /** The workspace to work in; the backend never disposes it. */
    workspace: IWorkspace;
    /** What to do, in plain language. */
    task: string;
    budget?: CodingBudget;
    signal?: AbortSignal;
};

export type CodingResult = {
    /** `done` when the task is solved, `stuck` when the backend gave up. */
    status: 'done' | 'stuck';
    summary: string;
    /** The workspace's changes as a unified diff. */
    diff: string;
};

/**
 * Something that solves a coding task in a workspace with its own tool loop
 * (the own coding tools, Claude Code, ...).
 */
export interface ICodingBackend {
    code(task: CodingTask): Promise<CodingResult>;
}
