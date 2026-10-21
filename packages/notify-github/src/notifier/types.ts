/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock } from '@chamvi/core';
import type { IGithubApp } from '@chamvi/github';

// #region public
/** The issue or pull request comments go to for runs not started by one. */
export type GithubNotifierTarget = {
    /** `owner/name`. */
    repo: string;
    /** The issue or pull request number. */
    number: number;
    /** The installation on `repo`, for a repository the run's installation does not cover. */
    installationId?: number;
};

export type GithubNotifierOptions = {
    app: IGithubApp;
    /** Default `'github'`. */
    name?: string;
    /** Logins mentioned at the top of every comment (without `@`). */
    mention?: string | readonly string[];
    /** Where to comment for runs without an issue or pull request (cron, http, a push delivery). */
    target?: GithubNotifierTarget;
    /**
     * A link to the approval in the chamvi UI, e.g.
     * `https://<app>/ui/approvals?run=<runId>&approval=<approvalId>`, where the
     * signed-in owner answers it; it carries no token.
     */
    approvalUrl?: (ref: { runId: string; approvalId: string; agent: string }) => string;
    /** Default `GITHUB_NOTIFIER_TIMEOUT_MS` (30 s). */
    timeoutMs?: number;
    clock?: IClock;
};
// #endregion public

export type CommentTarget = {
    owner: string;
    repo: string;
    number: number;
    installationId?: number;
};

export type ResolvedGithubNotifierOptions = {
    app: IGithubApp;
    name: string;
    mentions: string[];
    target?: CommentTarget;
    approvalUrl?: (ref: { runId: string; approvalId: string; agent: string }) => string;
    timeoutMs: number;
    clock: IClock;
};
