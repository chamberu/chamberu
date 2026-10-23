/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isObject } from 'smob';
import {
    ChamviError,
    InvalidAgentDefinitionError,
    ValidationError,
    effectMarker,
} from '@chamvi/core';
import type { ChannelMessage, ChannelSendOptions, TriggerEnvelope } from '@chamvi/core';
import { isSameLogin } from '../app/helpers.ts';
import { isPositiveInteger } from '../subscription/helpers.ts';
import { GITHUB_REQUEST_ERROR_CODE } from '../tools/constants.ts';
import { RECONCILE_SKEW_MS } from './constants.ts';
import { markerKey, parseAddress, renderComment } from './helpers.ts';
import type { ResolvedGithubChannelOptions } from './types.ts';

function requestError(error: unknown): ChamviError {
    const status = isObject(error) && typeof error.status === 'number' ? error.status : undefined;
    const message = error instanceof Error ? error.message : String(error);
    return new ChamviError({
        message: status !== undefined ? `GitHub ${status}: ${message}` : `GitHub request failed: ${message}`,
        code: GITHUB_REQUEST_ERROR_CODE,
    });
}

/**
 * The installation to comment as, the github tools' rule: the event's for a
 * run this channel started, else the app's `installationId`.
 */
function installationOf(message: ChannelMessage, trigger: TriggerEnvelope, options: ResolvedGithubChannelOptions): number {
    if (trigger.channel === options.name && isObject(trigger.payload) && isPositiveInteger(trigger.payload.installationId)) {
        return trigger.payload.installationId;
    }
    if (options.app.installationId !== undefined) return options.app.installationId;
    throw new InvalidAgentDefinitionError(
        `githubChannel: run ${message.runId} of agent "${message.agent}" has no GitHub installation; ` +
        'set installationId on createGithubApp() for runs not started by a GitHub delivery.',
    );
}

/**
 * The channel's `out`: one comment on the issue or pull request `address`
 * (`owner/repo#n`) as the GitHub App, carrying `effectMarker(message.key)`.
 * A resend first looks for the App bot's comment holding the marker and
 * posts nothing when it finds one. Throws a ValidationError for another
 * address and InvalidAgentDefinitionError without an installation (both
 * before any request), a `github_request` ChamviError for a GitHub failure
 * or a GitHub that does not answer within `timeoutMs`, and the caller's
 * abort reason when `opts.signal` aborts.
 */
export function createCommentSender(options: ResolvedGithubChannelOptions) {
    const { app } = options;
    return async (message: ChannelMessage, address: string, opts: ChannelSendOptions): Promise<void> => {
        const target = parseAddress(address);
        if (!target) {
            throw new ValidationError(`The GitHub channel needs an address like "owner/repo#12", got ${JSON.stringify(address)}.`);
        }
        const installationId = installationOf(message, opts.trigger, options);
        opts.signal?.throwIfAborted();

        const controller = new AbortController();
        const timeout = new ChamviError({
            message: `GitHub did not answer within ${options.timeoutMs}ms.`,
            code: GITHUB_REQUEST_ERROR_CODE,
        });
        const timer = options.clock.setTimeout(() => controller.abort(timeout), options.timeoutMs);
        const signal = opts.signal ? AbortSignal.any([opts.signal, controller.signal]) : controller.signal;
        try {
            const octokit = await app.octokit(installationId);
            octokit.hook.before('request', (request) => {
                request.request = { ...request.request, signal };
            });
            const marker = effectMarker(markerKey(message.key));
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
                body: renderComment(message, {
                    mentions: options.mentions,
                    ...(options.approvalUrl ? { approvalUrl: options.approvalUrl } : {}),
                    marker,
                }),
            });
        } catch (error) {
            if (opts.signal?.aborted) throw opts.signal.reason;
            if (error instanceof ChamviError) throw error;
            // Octokit wraps the abort reason as a 500 RequestError
            if (controller.signal.aborted) throw timeout;
            throw requestError(error);
        } finally {
            timer.clear();
        }
    };
}
