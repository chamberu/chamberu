/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isObject } from 'smob';
import { ChamviError, effectMarker } from '@chamvi/core';
import type { INotifier } from '@chamvi/core';
import { GITHUB_REQUEST_ERROR_CODE } from '@chamvi/github';
import { RECONCILE_SKEW_MS } from './constants.ts';
import {
    isSameLogin,
    markerKey,
    renderComment,
    resolveOptions,
    resolveTarget,
} from './helpers.ts';
import type { GithubNotifierOptions } from './types.ts';

function requestError(error: unknown): ChamviError {
    const status = isObject(error) && typeof error.status === 'number' ? error.status : undefined;
    const message = error instanceof Error ? error.message : String(error);
    return new ChamviError({
        message: status !== undefined ? `GitHub ${status}: ${message}` : `GitHub request failed: ${message}`,
        code: GITHUB_REQUEST_ERROR_CODE,
    });
}

/**
 * A notifier commenting on the run's issue or pull request (or `target`),
 * as the GitHub App. The comment carries `effectMarker(idempotencyKey)`; a
 * resend first looks for the App bot's comment holding it and posts nothing
 * when it finds one. Every failure throws (the engine retries an approval on
 * the next poll), a stalled GitHub after `timeoutMs`.
 */
export function githubNotifier(options: GithubNotifierOptions): INotifier {
    const resolved = resolveOptions(options);
    const { app } = resolved;
    return {
        name: resolved.name,
        async notify(n, opts) {
            // a configuration error, thrown before any request
            const target = resolveTarget(opts.trigger, resolved, n.runId);
            const controller = new AbortController();
            const timeout = new ChamviError({
                message: `GitHub did not answer within ${resolved.timeoutMs}ms.`,
                code: GITHUB_REQUEST_ERROR_CODE,
            });
            const timer = resolved.clock.setTimeout(() => controller.abort(timeout), resolved.timeoutMs);
            try {
                const octokit = await app.octokit(target.installationId);
                const { signal } = controller;
                octokit.hook.before('request', (request) => {
                    request.request = { ...request.request, signal };
                });
                const marker = effectMarker(markerKey(opts.idempotencyKey));
                const since = new Date(new Date(opts.trigger.receivedAt).getTime() - RECONCILE_SKEW_MS).toISOString();
                const route = {
                    owner: target.owner,
                    repo: target.repo,
                    issue_number: target.number,
                };
                const pages = octokit.paginate.iterator('GET /repos/{owner}/{repo}/issues/{issue_number}/comments', {
                    ...route,
                    since,
                    per_page: 100,
                });
                for await (const { data } of pages) {
                    for (const comment of data) {
                        if (!comment.body?.includes(marker)) continue;
                        const user = isObject(comment.user) ? comment.user : undefined;
                        if (user?.type === 'Bot' && isSameLogin(user.login, await app.botLogin())) return;
                    }
                }
                await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/comments', {
                    ...route,
                    body: renderComment(n, {
                        mentions: resolved.mentions,
                        ...(resolved.approvalUrl ? { approvalUrl: resolved.approvalUrl } : {}),
                        marker,
                    }),
                });
            } catch (error) {
                if (error instanceof ChamviError) throw error;
                // Octokit wraps the abort reason as a 500 RequestError
                if (controller.signal.aborted) throw timeout;
                throw requestError(error);
            } finally {
                timer.clear();
            }
        },
    };
}
