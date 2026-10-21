/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createHash } from 'node:crypto';
import { isObject } from 'smob';
import { InvalidAgentDefinitionError, systemClock } from '@chamvi/core';
import type { Notification, TriggerEnvelope } from '@chamvi/core';
import { REPO_PATTERN } from '@chamvi/github';
import {
    BACKTICK_RUN_MAX_LENGTH,
    COMMENT_BODY_MAX_LENGTH,
    DEFAULT_NOTIFIER_NAME,
    GITHUB_NOTIFIER_TIMEOUT_MS,
    LOGIN_PATTERN,
    SAFE_KEY_PATTERN,
} from './constants.ts';
import type {
    CommentTarget,
    GithubNotifierOptions,
    ResolvedGithubNotifierOptions,
} from './types.ts';

const REPO = new RegExp(REPO_PATTERN);
const LOGIN = new RegExp(LOGIN_PATTERN);
const SAFE_KEY = new RegExp(SAFE_KEY_PATTERN);

function invalid(message: string): InvalidAgentDefinitionError {
    return new InvalidAgentDefinitionError(`githubNotifier: ${message}`);
}

function isPositiveInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function parseRepo(value: unknown): { owner: string; repo: string } | undefined {
    const match = typeof value === 'string' ? REPO.exec(value) : null;
    if (!match?.[1] || !match[2]) return undefined;
    return { owner: match[1], repo: match[2] };
}

export function resolveOptions(options: GithubNotifierOptions): ResolvedGithubNotifierOptions {
    const { app } = options;
    if (!isObject(app) || typeof app.octokit !== 'function' || typeof app.botLogin !== 'function') {
        throw invalid('app must be the IGithubApp of createGithubApp().');
    }
    const name = options.name ?? DEFAULT_NOTIFIER_NAME;
    if (typeof name !== 'string' || name.length === 0) throw invalid('name must be a non-empty string.');

    const mention = options.mention ?? [];
    const mentions = typeof mention === 'string' ? [mention] : [...mention];
    for (const login of mentions) {
        if (typeof login !== 'string' || !LOGIN.test(login)) {
            throw invalid(`mention must hold GitHub logins without "@", got ${JSON.stringify(login)}.`);
        }
    }

    let target: CommentTarget | undefined;
    if (options.target !== undefined) {
        const repo = parseRepo(options.target?.repo);
        if (!repo) throw invalid('target.repo must look like "owner/name".');
        if (!isPositiveInteger(options.target.number)) throw invalid('target.number must be a positive integer.');
        const { installationId } = options.target;
        if (installationId !== undefined && !isPositiveInteger(installationId)) {
            throw invalid('target.installationId must be a positive integer.');
        }
        target = {
            ...repo,
            number: options.target.number,
            ...(installationId === undefined ? {} : { installationId }),
        };
    }

    if (options.approvalUrl !== undefined && typeof options.approvalUrl !== 'function') {
        throw invalid('approvalUrl must be a function.');
    }
    const timeoutMs = options.timeoutMs ?? GITHUB_NOTIFIER_TIMEOUT_MS;
    if (!isPositiveInteger(timeoutMs)) throw invalid('timeoutMs must be a positive integer.');

    return {
        app,
        name,
        mentions,
        ...(target ? { target } : {}),
        ...(options.approvalUrl ? { approvalUrl: options.approvalUrl } : {}),
        timeoutMs,
        clock: options.clock ?? systemClock,
    };
}

/** The issue or pull request of a `github` run's event, if it names one. */
function eventTarget(trigger: TriggerEnvelope): CommentTarget | undefined {
    if (trigger.source !== 'github' || !isObject(trigger.payload)) return undefined;
    const event = trigger.payload.payload;
    if (!isObject(event) || !isObject(event.repository)) return undefined;
    const repo = parseRepo(event.repository.full_name);
    if (!repo) return undefined;
    const issue = isObject(event.issue) ? event.issue.number : undefined;
    const pull = isObject(event.pull_request) ? event.pull_request.number : undefined;
    const number = issue ?? pull;
    return isPositiveInteger(number) ? { ...repo, number } : undefined;
}

/**
 * Where the run's comment goes: the issue or pull request of a `github`
 * run, else `target`. The installation is `target.installationId` for a
 * comment on `target`, else the github tools' rule: the event's for a
 * `github` run, else the app's.
 */
export function resolveTarget(
    trigger: TriggerEnvelope,
    options: ResolvedGithubNotifierOptions,
    runId: string,
): CommentTarget & { installationId: number } {
    const target = eventTarget(trigger) ?? options.target;
    if (!target) {
        throw invalid(`run ${runId} of agent "${trigger.agent}" has no issue or pull request; set target for runs not started by an issue or pull request event.`);
    }
    // eventTarget() never sets one, so this is target.installationId
    let { installationId } = target;
    if (installationId === undefined && trigger.source === 'github' && isObject(trigger.payload) && isPositiveInteger(trigger.payload.installationId)) {
        installationId = trigger.payload.installationId;
    }
    installationId ??= options.app.installationId;
    if (installationId === undefined) {
        throw invalid(`run ${runId} has no GitHub installation; set installationId on createGithubApp() (or target.installationId) for runs not started by a GitHub delivery.`);
    }
    return { ...target, installationId };
}

/**
 * The key as the marker holds it, else a stable `sha256:<hex>` stand-in: an
 * HTML comment breaks on `--` (and `-->`), whitespace or a long key.
 */
export function markerKey(key: string): string {
    if (SAFE_KEY.test(key) && !key.includes('--')) return key;
    return `sha256:${createHash('sha256').update(key).digest('hex')}`;
}

/**
 * `text` when it has at most `max` characters, else its first `max`
 * characters (one less when that would end on a high surrogate) and a note
 * of how many were cut.
 */
export function cutText(text: string, max: number): string {
    if (text.length <= max) return text;
    let end = max;
    const last = text.charCodeAt(end - 1);
    if (last >= 0xD800 && last <= 0xDBFF) end--;
    return `${text.slice(0, end)}\n… (cut, ${text.length - end} more characters)`;
}

/** Backticks, one more than the longest run of backticks in `text`, at least three. */
export function fenceFor(text: string): string {
    let longest = 0;
    for (const run of text.match(/`+/g) ?? []) longest = Math.max(longest, run.length);
    return '`'.repeat(Math.max(3, longest + 1));
}

/** Breaks backtick runs above `BACKTICK_RUN_MAX_LENGTH` with zero-width spaces, so no fence grows past it. */
function breakBacktickRuns(text: string): string {
    const pattern = new RegExp(`\`{${BACKTICK_RUN_MAX_LENGTH + 1},}`, 'g');
    const chunk = new RegExp(`\`{1,${BACKTICK_RUN_MAX_LENGTH}}`, 'g');
    return text.replace(pattern, (run) => (run.match(chunk) ?? []).join('​'));
}

export function isSameLogin(a: unknown, b: string): boolean {
    return typeof a === 'string' && a.toLowerCase() === b.toLowerCase();
}

/**
 * The comment: mentions, the title, the body in a fence no backtick run in
 * it can close (so a `@login` or `#123` inside notifies nobody), the
 * approval line (a link with run and approval id, never the token), the
 * run and the marker.
 */
export function renderComment(
    n: Notification,
    input: {
        mentions: readonly string[]; 
        approvalUrl?: (ref: {
            runId: string; 
            approvalId: string; 
            agent: string 
        }) => string; 
        marker: string 
    },
): string {
    const sections: string[] = [];
    if (input.mentions.length > 0) sections.push(input.mentions.map((login) => `@${login}`).join(' '));
    sections.push(`### ${n.title.replace(/\s+/g, ' ').trim()}`);
    const body = breakBacktickRuns(cutText(n.body, COMMENT_BODY_MAX_LENGTH));
    const fence = fenceFor(body);
    sections.push(`${fence}\n${body}\n${fence}`);
    const footer: string[] = [];
    if (n.kind === 'approval') {
        const until = n.expiresAt ? `Waiting for approval until ${n.expiresAt.toISOString()}.` : 'Waiting for approval.';
        const link = input.approvalUrl && n.approvalId ?
            input.approvalUrl({
                runId: n.runId,
                approvalId: n.approvalId,
                agent: n.agent,
            }) :
            undefined;
        footer.push(link ?
            `${until} Approve or deny: ${link}` :
            `${until} Answer it in the chamvi UI, the REST API or the MCP tool resume_run.`);
    }
    footer.push(`Run \`${n.runId}\` of agent \`${n.agent}\`.`);
    sections.push(footer.join('\n'), input.marker);
    return sections.join('\n\n');
}
