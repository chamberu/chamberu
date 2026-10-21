/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { INotifier } from '@chamvi/core';
import { HOOK_NAME } from './constants.ts';
import {
    renderMessage,
    requestError,
    resolveOptions,
    responseError,
    transportKey,
} from './helpers.ts';
import type { OpenclawHookBody, OpenclawNotifierOptions } from './types.ts';

/**
 * A notifier posting to OpenClaw's `POST <hooksPath>/agent`: OpenClaw runs an
 * agent turn on the message and delivers the answer to `deliver`. The
 * `Idempotency-Key` and a deterministic message let OpenClaw replay a resend
 * after a lost response; every failure throws (the engine retries an
 * approval on the next poll), a stalled gateway after `timeoutMs`.
 */
export function openclaw(options: OpenclawNotifierOptions): INotifier {
    const resolved = resolveOptions(options);
    return {
        name: resolved.name,
        async notify(n, opts) {
            const controller = new AbortController();
            const timeout = requestError(`OpenClaw did not answer within ${resolved.timeoutMs}ms.`);
            const timer = resolved.clock.setTimeout(() => controller.abort(timeout), resolved.timeoutMs);
            const secrets = [resolved.hooksToken, n.resumeToken];
            try {
                const body: OpenclawHookBody = {
                    message: renderMessage(n, resolved.resumeUrl),
                    name: HOOK_NAME,
                    ...(resolved.agentId === undefined ? {} : { agentId: resolved.agentId }),
                    deliver: true,
                    channel: resolved.deliver.channel,
                    to: resolved.deliver.to,
                    ...(resolved.deliver.accountId === undefined ? {} : { accountId: resolved.deliver.accountId }),
                };
                let response: Response;
                try {
                    response = await resolved.fetch(resolved.url, {
                        method: 'POST',
                        headers: {
                            'authorization': `Bearer ${resolved.hooksToken}`,
                            'content-type': 'application/json',
                            'idempotency-key': transportKey(opts.idempotencyKey),
                        },
                        body: JSON.stringify(body),
                        signal: controller.signal,
                    });
                } catch (error) {
                    if (controller.signal.aborted) throw timeout;
                    const message = error instanceof Error ? error.message : String(error);
                    throw requestError(`OpenClaw request failed: ${message}`);
                }
                if (response.ok) {
                    // admitted; the answer (`{ ok, runId }`) is not needed
                    await response.body?.cancel().catch(() => undefined);
                    return;
                }
                let text: string;
                try {
                    text = await response.text();
                } catch (error) {
                    if (controller.signal.aborted) throw timeout;
                    text = error instanceof Error ? error.message : String(error);
                }
                throw responseError(response.status, text, response.headers.get('retry-after'), secrets);
            } finally {
                timer.clear();
            }
        },
    };
}
